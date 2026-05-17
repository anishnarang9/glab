import { randomUUID } from 'node:crypto'
import { strict as assert } from 'node:assert'
import { ensureDefaultBrain } from '@/lib/brain'
import { runSharedArtifactIngestion } from '@/lib/shared-artifact-ingestion'
import { supabaseAdmin } from '@/lib/supabase'

type SmokeState = {
  artifactIds: string[]
  evidenceIds: string[]
  decisionIds: string[]
  edgeIds: string[]
  claimIds: string[]
  commitIds: string[]
}

async function main(): Promise<void> {
  if (process.env.P4_E2E_PROD !== 'true') {
    throw new Error('Refusing production smoke test unless P4_E2E_PROD=true')
  }

  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[key]) throw new Error(`${key} is required for production smoke verification`)
  }

  const brain = await ensureDefaultBrain()
  const marker = `[P4_E2E_SMOKE:${randomUUID()}]`
  const client = supabaseAdmin()
  let artifactId: string | null = null

  try {
    const inserted = await client
      .from('artifacts')
      .insert({
        brain_id: null,
        type: 'finding',
        tier: 'shared',
        title: `${marker} Visual cortex CLIP alignment smoke`,
        content: [
          `${marker} Researcher GBrain smoke artifact.`,
          'Visual cortex object responses align with CLIP embedding geometry across repeated fMRI sessions.',
          'This should be accepted by OpenClaw as relevant GTech neuroscience shared truth and become evidence, a decision, a truth claim, and a brain commit.',
        ].join('\n'),
      })
      .select('id')
      .single()

    if (inserted.error) throw inserted.error
    artifactId = inserted.data.id

    if (process.env.P4_E2E_USE_WORKER === 'true') {
      await waitForWorkerToIngest(brain.id, artifactId)
    } else {
      const summary = await runSharedArtifactIngestion({ trigger: 'manual', limit: 100 })
      assert.equal(summary.enabled, true)
      assert(summary.ingested >= 1, `Expected at least one shared artifact ingestion; got ${JSON.stringify(summary)}`)
      assert.equal(summary.errors.length, 0, `Shared artifact ingestion errors: ${summary.errors.join('; ')}`)
    }

    const state = await loadSmokeState(marker, artifactId)
    assert(state.evidenceIds.length >= 1, 'Smoke artifact did not become evidence')
    assert(state.decisionIds.length >= 1, 'Smoke evidence did not receive an OpenClaw decision')
    assert(state.claimIds.length >= 1, 'Smoke evidence did not update shared truth claims')
    assert(state.commitIds.length >= 1, 'Smoke evidence did not create brain commit records')

    console.log(`Production E2E smoke verification passed for ${marker}`)
  } finally {
    await cleanupSmokeRun(marker, artifactId)
  }
}

async function waitForWorkerToIngest(brainId: string, artifactId: string): Promise<void> {
  const timeoutMs = readIntEnv('P4_E2E_TIMEOUT_MS', 120_000, 10_000, 600_000)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const state = await loadSmokeState('', artifactId)
    if (state.evidenceIds.length > 0 && state.decisionIds.length > 0 && state.claimIds.length > 0) return

    const heartbeat = await supabaseAdmin()
      .from('openclaw_instances')
      .select('id, last_heartbeat_at')
      .eq('brain_id', brainId)
      .eq('status', 'active')
      .order('last_heartbeat_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (heartbeat.error) throw heartbeat.error
    await sleep(5_000)
  }

  throw new Error(`Timed out waiting ${timeoutMs}ms for Railway worker to ingest smoke artifact ${artifactId}`)
}

async function loadSmokeState(marker: string, artifactId: string | null): Promise<SmokeState> {
  const client = supabaseAdmin()
  const artifactIds = new Set<string>()
  if (artifactId) artifactIds.add(artifactId)

  if (marker) {
    const artifacts = await client
      .from('artifacts')
      .select('id')
      .ilike('title', `%${marker}%`)
    if (artifacts.error) throw artifacts.error
    for (const artifact of artifacts.data) artifactIds.add(artifact.id)
  }

  const evidenceIds = new Set<string>()
  if (artifactIds.size > 0) {
    const evidence = await client
      .from('evidence_items')
      .select('id')
      .in('artifact_id', [...artifactIds])
    if (evidence.error) throw evidence.error
    for (const item of evidence.data) evidenceIds.add(item.id)
  }

  const decisionIds = new Set<string>()
  if (evidenceIds.size > 0) {
    const decisions = await client
      .from('openclaw_decisions')
      .select('id')
      .in('evidence_id', [...evidenceIds])
    if (decisions.error) throw decisions.error
    for (const decision of decisions.data) decisionIds.add(decision.id)
  }

  const edgeIds = new Set<string>()
  const claimIds = new Set<string>()
  if (evidenceIds.size > 0) {
    const edges = await client
      .from('truth_evidence_edges')
      .select('id, claim_id')
      .in('evidence_id', [...evidenceIds])
    if (edges.error) throw edges.error
    for (const edge of edges.data) {
      edgeIds.add(edge.id)
      if (edge.claim_id) claimIds.add(edge.claim_id)
    }
  }

  const entityIds = [...artifactIds, ...evidenceIds, ...decisionIds, ...claimIds]
  const commitIds = new Set<string>()
  if (entityIds.length > 0) {
    const changes = await client
      .from('brain_commit_changes')
      .select('commit_id')
      .in('entity_id', entityIds)
    if (changes.error) throw changes.error
    for (const change of changes.data) {
      if (change.commit_id) commitIds.add(change.commit_id)
    }
  }

  return {
    artifactIds: [...artifactIds],
    evidenceIds: [...evidenceIds],
    decisionIds: [...decisionIds],
    edgeIds: [...edgeIds],
    claimIds: [...claimIds],
    commitIds: [...commitIds],
  }
}

async function cleanupSmokeRun(marker: string, artifactId: string | null): Promise<void> {
  const state = await loadSmokeState(marker, artifactId)
  const client = supabaseAdmin()

  if (state.claimIds.length > 0) {
    await throwOnError(client.from('truth_claims').update({ current_revision_id: null }).in('id', state.claimIds))
  }
  await deleteByIds('truth_evidence_edges', state.edgeIds)
  await deleteByIds('truth_revisions', state.claimIds, 'claim_id')
  await deleteByIds('truth_claims', state.claimIds)
  await deleteByIds('openclaw_decisions', state.decisionIds)
  await deleteByIds('evidence_items', state.evidenceIds)
  await deleteByIds('artifacts', state.artifactIds)
  await deleteByIds('brain_commit_changes', state.commitIds, 'commit_id')
  await deleteByIds('brain_commits', state.commitIds)
}

async function deleteByIds(
  table: 'truth_evidence_edges' | 'truth_revisions' | 'truth_claims' | 'openclaw_decisions' | 'evidence_items' | 'artifacts' | 'brain_commit_changes' | 'brain_commits',
  ids: string[],
  column = 'id',
): Promise<void> {
  if (ids.length === 0) return
  await throwOnError(supabaseAdmin().from(table).delete().in(column, ids))
}

async function throwOnError<T extends { error: unknown }>(promise: PromiseLike<T>): Promise<void> {
  const result = await promise
  if (result.error) throw result.error
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isInteger(raw)) return fallback
  return Math.max(min, Math.min(max, raw))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
