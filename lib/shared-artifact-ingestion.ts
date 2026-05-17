// Supabase-first live intake for shared artifacts written by smaller GBrains.

import {
  createBrainCommit,
  createEvidenceItem,
  ensureDefaultBrain,
  ensureResearcherSharedSource,
  finishIngestionRun,
  hashText,
  startIngestionRun,
} from '@/lib/brain'
import { embeddingsOrNull, normalizeEmbedding } from '@/lib/embedding-storage'
import { runOpenClawOnEvidence } from '@/lib/openclaw'
import { supabaseAdmin } from '@/lib/supabase'
import type { Artifact, Brain, BrainSource, EvidenceItem, IngestionRunTrigger } from '@/db/client'

type SharedArtifactCandidate = Pick<Artifact, 'id' | 'brain_id' | 'tier' | 'content' | 'created_at'>

type EvidenceFingerprint = Pick<EvidenceItem, 'artifact_id' | 'content_hash'>

export type SharedArtifactIngestionSummary = {
  enabled: boolean
  scanned: number
  pending: number
  ingested: number
  skipped: number
  errors: string[]
}

export function selectPendingSharedArtifacts<T extends SharedArtifactCandidate>(
  artifacts: T[],
  existingEvidence: EvidenceFingerprint[],
  brainId: string,
): T[] {
  const evidenceArtifactIds = new Set(existingEvidence.map((item) => item.artifact_id).filter(Boolean))
  const evidenceContentHashes = new Set(existingEvidence.map((item) => item.content_hash).filter(Boolean))

  return artifacts
    .filter((artifact) => {
      if (artifact.tier !== 'shared') return false
      if (artifact.brain_id !== brainId && artifact.brain_id !== null) return false
      if (evidenceArtifactIds.has(artifact.id)) return false
      if (evidenceContentHashes.has(hashText(artifact.content))) return false
      return true
    })
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
}

export async function runSharedArtifactIngestion(input: {
  limit?: number
  trigger?: IngestionRunTrigger
} = {}): Promise<SharedArtifactIngestionSummary> {
  if (process.env.SUPABASE_SHARED_INGEST_ENABLED === 'false') {
    return { enabled: false, scanned: 0, pending: 0, ingested: 0, skipped: 0, errors: [] }
  }

  const brain = await ensureDefaultBrain()
  const source = await ensureResearcherSharedSource(brain.id)
  const artifacts = await loadVisibleSharedArtifacts(brain.id, input.limit ?? readIntEnv('SHARED_ARTIFACT_INGEST_LIMIT', 500, 1, 1000))
  const existingEvidence = await loadExistingEvidenceFingerprints(brain.id, artifacts)
  const pendingArtifacts = selectPendingSharedArtifacts(artifacts, existingEvidence, brain.id)

  const summary: SharedArtifactIngestionSummary = {
    enabled: true,
    scanned: artifacts.length,
    pending: pendingArtifacts.length,
    ingested: 0,
    skipped: 0,
    errors: [],
  }

  if (pendingArtifacts.length === 0) return summary

  const resolvedEmbeddings = await embeddingsOrNull({
    contents: pendingArtifacts.map((artifact) => artifact.content),
    existing: pendingArtifacts.map((artifact) => artifact.embedding),
  })
  const embeddingByArtifactId = new Map(
    pendingArtifacts.map((artifact, index) => [artifact.id, resolvedEmbeddings[index]]),
  )

  const run = await startIngestionRun({
    brainId: brain.id,
    sourceId: source.id,
    trigger: input.trigger ?? 'researcher_share',
  })

  for (const artifact of pendingArtifacts) {
    try {
      const adopted = await adoptArtifactForBrain(artifact, brain.id)
      const embedded = await ensureArtifactEmbedding(adopted, embeddingByArtifactId.get(artifact.id) ?? null)
      const { evidence, created } = await createEvidenceItem({
        brainId: brain.id,
        sourceId: source.id,
        ingestionRunId: run.id,
        artifactId: embedded.id,
        sourceKind: 'researcher_shared_artifacts',
        sourceRef: embedded.id,
        title: embedded.title,
        content: embedded.content,
        embedding: embedded.embedding,
      })

      if (!created) {
        summary.skipped += 1
        continue
      }

      summary.ingested += 1
      await recordSharedArtifactCommit({ brain, source, artifact: embedded, evidence, ingestionRunId: run.id })
      await runOpenClawOnEvidence({ brain, evidence, ingestionRunId: run.id })
    } catch (error) {
      summary.errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  await finishIngestionRun(
    run.id,
    summary.errors.length > 0 ? 'failed' : summary.ingested > 0 ? 'succeeded' : 'skipped',
    summary.errors.length > 0 ? summary.errors.join('; ').slice(0, 1000) : undefined,
  )

  return summary
}

async function ensureArtifactEmbedding(artifact: Artifact, resolvedEmbedding: number[] | null): Promise<Artifact> {
  const existing = normalizeEmbedding(artifact.embedding)
  if (existing) return { ...artifact, embedding: existing }
  if (!resolvedEmbedding) return artifact

  const client = supabaseAdmin()
  const { data, error } = await client
    .from('artifacts')
    .update({ embedding: resolvedEmbedding })
    .eq('id', artifact.id)
    .select()
    .single()

  if (error) throw error
  return { ...data, embedding: resolvedEmbedding }
}

async function loadVisibleSharedArtifacts(brainId: string, limit: number): Promise<Artifact[]> {
  const client = supabaseAdmin()
  const [assigned, unassigned] = await Promise.all([
    client
      .from('artifacts')
      .select()
      .eq('tier', 'shared')
      .eq('brain_id', brainId)
      .order('created_at', { ascending: false })
      .limit(limit),
    client
      .from('artifacts')
      .select()
      .eq('tier', 'shared')
      .is('brain_id', null)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (assigned.error) throw assigned.error
  if (unassigned.error) throw unassigned.error
  return dedupeArtifacts([...assigned.data, ...unassigned.data]).slice(0, limit)
}

async function loadExistingEvidenceFingerprints(brainId: string, artifacts: Artifact[]): Promise<EvidenceFingerprint[]> {
  if (artifacts.length === 0) return []

  const client = supabaseAdmin()
  const artifactIds = [...new Set(artifacts.map((artifact) => artifact.id))]
  const contentHashes = [...new Set(artifacts.map((artifact) => hashText(artifact.content)))]

  const [byArtifact, byHash] = await Promise.all([
    client
      .from('evidence_items')
      .select('artifact_id, content_hash')
      .eq('brain_id', brainId)
      .in('artifact_id', artifactIds),
    client
      .from('evidence_items')
      .select('artifact_id, content_hash')
      .eq('brain_id', brainId)
      .in('content_hash', contentHashes),
  ])

  if (byArtifact.error) throw byArtifact.error
  if (byHash.error) throw byHash.error
  return [...byArtifact.data, ...byHash.data]
}

async function adoptArtifactForBrain(artifact: Artifact, brainId: string): Promise<Artifact> {
  if (artifact.brain_id === brainId) return artifact

  const client = supabaseAdmin()
  const { data, error } = await client
    .from('artifacts')
    .update({ brain_id: brainId })
    .eq('id', artifact.id)
    .is('brain_id', null)
    .select()
    .single()

  if (error) throw error
  return data
}

async function recordSharedArtifactCommit(input: {
  brain: Brain
  source: BrainSource
  artifact: Artifact
  evidence: EvidenceItem
  ingestionRunId: string
}): Promise<void> {
  await createBrainCommit({
    brainId: input.brain.id,
    ingestionRunId: input.ingestionRunId,
    kind: 'evidence_added',
    summary: `Small GBrain shared artifact became Central GBrain evidence: ${input.artifact.title ?? input.artifact.id}`,
    changes: [
      {
        entityType: 'source',
        entityId: input.source.id,
        changeType: 'linked',
        after: { kind: 'researcher_shared_artifacts', intake: 'supabase_direct' },
      },
      {
        entityType: 'artifact',
        entityId: input.artifact.id,
        changeType: 'updated',
        after: { tier: 'shared', brain_id: input.brain.id },
      },
      {
        entityType: 'evidence',
        entityId: input.evidence.id,
        changeType: 'created',
        after: { source_kind: 'researcher_shared_artifacts', source_ref: input.artifact.id },
      },
    ],
  })
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isInteger(raw)) return fallback
  return Math.max(min, Math.min(max, raw))
}

function dedupeArtifacts(artifacts: Artifact[]): Artifact[] {
  const seen = new Set<string>()
  const unique: Artifact[] = []
  for (const artifact of artifacts) {
    if (seen.has(artifact.id)) continue
    seen.add(artifact.id)
    unique.push(artifact)
  }
  return unique.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
}
