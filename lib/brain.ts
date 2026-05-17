// Central GBrain core helpers: brain identity, sources, ingestion runs, evidence, commits.

import { createHash } from 'node:crypto'
import { embeddingOrNull, type Embedder, type StoredEmbedding } from '@/lib/embedding-storage'
import { supabaseAdmin } from '@/lib/supabase'
import type {
  Brain,
  BrainCommit,
  BrainCommitChangeType,
  BrainCommitEntityType,
  BrainCommitKind,
  BrainSource,
  BrainSourceCadence,
  BrainSourceKind,
  EvidenceItem,
  IngestionRun,
  IngestionRunStatus,
  IngestionRunTrigger,
  Json,
} from '@/db/client'

type EnsureBrainInput = {
  name?: string
  subject?: string
  mission?: string
}

type EnsureSourceInput = {
  brainId: string
  kind: BrainSourceKind
  label: string
  config?: Json
  cadence?: BrainSourceCadence
  enabled?: boolean
}

type StartRunInput = {
  brainId: string
  sourceId?: string | null
  trigger: IngestionRunTrigger
}

type EvidenceInput = {
  brainId: string
  sourceId?: string | null
  ingestionRunId?: string | null
  artifactId?: string | null
  paperId?: string | null
  sourceKind: string
  sourceRef?: string | null
  title?: string | null
  content: string
  url?: string | null
  publishedAt?: string | null
  embedding?: StoredEmbedding
}

type CommitChangeInput = {
  entityType: BrainCommitEntityType
  entityId: string
  changeType: BrainCommitChangeType
  before?: Json | null
  after?: Json | null
}

type CreateCommitInput = {
  brainId: string
  kind: BrainCommitKind
  summary: string
  ingestionRunId?: string | null
  changes?: CommitChangeInput[]
}

export async function ensureDefaultBrain(input: EnsureBrainInput = {}): Promise<Brain> {
  const name = input.name ?? process.env.LABBRAIN_DEFAULT_BRAIN_NAME ?? 'LabBrain'
  const subject = input.subject ?? process.env.LABBRAIN_DEFAULT_BRAIN_SUBJECT ?? 'research lab knowledge'
  const mission =
    input.mission ??
    process.env.LABBRAIN_DEFAULT_BRAIN_MISSION ??
    'Maintain evidence-backed shared truth for the lab.'

  const client = supabaseAdmin()
  const { data, error } = await client
    .from('brains')
    .upsert({ name, subject, mission, status: 'active' }, { onConflict: 'name' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getBrain(brainId: string): Promise<Brain> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('brains')
    .select()
    .eq('id', brainId)
    .single()

  if (error) throw error
  return data
}

export async function ensureBrainSource(input: EnsureSourceInput): Promise<BrainSource> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('brain_sources')
    .upsert(
      {
        brain_id: input.brainId,
        kind: input.kind,
        label: input.label,
        config: input.config ?? {},
        cadence: input.cadence ?? 'manual',
        enabled: input.enabled ?? true,
      },
      { onConflict: 'brain_id,kind,label' },
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function ensureResearcherSharedSource(brainId: string): Promise<BrainSource> {
  return ensureBrainSource({
    brainId,
    kind: 'researcher_shared_artifacts',
    label: 'Researcher shared artifacts',
    config: {},
    cadence: 'manual',
  })
}

export async function startIngestionRun(input: StartRunInput): Promise<IngestionRun> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('ingestion_runs')
    .insert({
      brain_id: input.brainId,
      source_id: input.sourceId ?? null,
      trigger: input.trigger,
      status: 'running',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function finishIngestionRun(
  runId: string,
  status: Exclude<IngestionRunStatus, 'running'>,
  errorMessage?: string,
): Promise<IngestionRun> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('ingestion_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      error: errorMessage ?? null,
    })
    .eq('id', runId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createEvidenceItem(input: EvidenceInput): Promise<{ evidence: EvidenceItem; created: boolean }> {
  const content = input.content.trim()
  if (!content) throw new Error('Evidence content is required')

  const contentHash = hashText(content)
  const client = supabaseAdmin()
  const existing = await client
    .from('evidence_items')
    .select()
    .eq('brain_id', input.brainId)
    .eq('content_hash', contentHash)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) {
    return { evidence: await ensureEvidenceEmbedding(existing.data), created: false }
  }

  const embedding = await resolveEvidenceEmbedding({
    content,
    embedding: input.embedding ?? null,
  })

  const { data, error } = await client
    .from('evidence_items')
    .insert({
      brain_id: input.brainId,
      source_id: input.sourceId ?? null,
      ingestion_run_id: input.ingestionRunId ?? null,
      artifact_id: input.artifactId ?? null,
      paper_id: input.paperId ?? null,
      source_kind: input.sourceKind,
      source_ref: input.sourceRef ?? null,
      title: input.title ?? null,
      content,
      url: input.url ?? null,
      published_at: input.publishedAt ?? null,
      embedding,
      content_hash: contentHash,
    })
    .select()
    .single()

  if (error) throw error
  return { evidence: data, created: true }
}

export async function backfillRecentEvidenceEmbeddings(input: {
  brainId: string
  limit?: number
}): Promise<{ scanned: number; updated: number; skipped: number }> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('evidence_items')
    .select('id, content, embedding')
    .eq('brain_id', input.brainId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 100)

  if (error) throw error

  let updated = 0
  let skipped = 0
  for (const evidence of data) {
    const before = evidence.embedding
    const after = await embeddingOrNull({
      content: evidence.content,
      existing: before as StoredEmbedding,
    })

    if (!after || before) {
      skipped += 1
      continue
    }

    const { error: updateError } = await client
      .from('evidence_items')
      .update({ embedding: after })
      .eq('id', evidence.id)

    if (updateError) throw updateError
    updated += 1
  }

  return { scanned: data.length, updated, skipped }
}

export async function resolveEvidenceEmbedding(input: {
  content: string
  embedding?: StoredEmbedding
  embedder?: Embedder
}): Promise<number[] | null> {
  return embeddingOrNull({
    content: input.content,
    existing: input.embedding ?? null,
    embedder: input.embedder,
  })
}

export async function ensureEvidenceEmbedding<T extends { id: string; content: string; embedding: StoredEmbedding }>(evidence: T): Promise<T> {
  if (evidence.embedding) return evidence

  const embedding = await resolveEvidenceEmbedding({
    content: evidence.content,
    embedding: evidence.embedding,
  })
  if (!embedding) return evidence

  const { data, error } = await supabaseAdmin()
    .from('evidence_items')
    .update({ embedding })
    .eq('id', evidence.id)
    .select()
    .single()

  if (error) throw error
  return data as unknown as T
}

export async function createBrainCommit(input: CreateCommitInput): Promise<BrainCommit> {
  const client = supabaseAdmin()
  const parent = await latestBrainCommit(input.brainId)
  const now = new Date().toISOString()
  const commitHash = hashCommit({
    brainId: input.brainId,
    parentCommitId: parent?.id ?? null,
    kind: input.kind,
    summary: input.summary,
    ingestionRunId: input.ingestionRunId ?? null,
    changes: input.changes ?? [],
    now,
  })

  const { data: commit, error } = await client
    .from('brain_commits')
    .insert({
      brain_id: input.brainId,
      parent_commit_id: parent?.id ?? null,
      ingestion_run_id: input.ingestionRunId ?? null,
      kind: input.kind,
      summary: input.summary,
      commit_hash: commitHash,
      created_at: now,
    })
    .select()
    .single()

  if (error) throw error

  if (input.changes?.length) {
    const { error: changesError } = await client.from('brain_commit_changes').insert(
      input.changes.map((change) => ({
        commit_id: commit.id,
        entity_type: change.entityType,
        entity_id: change.entityId,
        change_type: change.changeType,
        before_json: change.before ?? null,
        after_json: change.after ?? null,
      })),
    )
    if (changesError) throw changesError
  }

  return commit
}

export async function latestBrainCommit(brainId: string): Promise<BrainCommit | null> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('brain_commits')
    .select()
    .eq('brain_id', brainId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export function hashText(value: string): string {
  return createHash('sha256').update(value.trim()).digest('hex')
}

function hashCommit(input: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
