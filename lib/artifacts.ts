// Researcher artifact helpers. Shared artifacts feed the Central GBrain as evidence.

import {
  createBrainCommit,
  createEvidenceItem,
  ensureDefaultBrain,
  ensureResearcherSharedSource,
  finishIngestionRun,
  getBrain,
  startIngestionRun,
} from '@/lib/brain'
import { embeddingOrNull, validateEmbedding } from '@/lib/embedding-storage'
import { runOpenClawOnEvidence } from '@/lib/openclaw'
import { supabaseAdmin } from '@/lib/supabase'
import type {
  Artifact as ArtifactRecord,
  ArtifactTier as Tier,
  ArtifactType,
  EvidenceItem,
  Researcher as ResearcherRecord,
} from '@/db/client'

export const ARTIFACT_TYPES = [
  'project',
  'note',
  'paper_ref',
  'finding',
  'hypothesis',
] as const

export const TIERS = ['private', 'shared'] as const

export type { ArtifactRecord, ArtifactType, ResearcherRecord, Tier }

export type CreateArtifactInput = {
  ownerId: string
  type: ArtifactType
  content: string
  title?: string | null
  tier?: Tier
  brainId?: string | null
  embedding?: number[] | null
}

export type ShareArtifactResult = {
  artifact: ArtifactRecord
  evidence?: EvidenceItem
}

export function isArtifactType(value: string): value is ArtifactType {
  return ARTIFACT_TYPES.includes(value as ArtifactType)
}

export function isTier(value: string): value is Tier {
  return TIERS.includes(value as Tier)
}

export function defaultTierFor(_type: ArtifactType): Tier {
  return 'private'
}

export function sharePromptCopy(type: ArtifactType): string {
  switch (type) {
    case 'project':
      return 'Share this project when it is ready to become evidence for the Central GBrain.'
    case 'finding':
      return 'Share this finding when the lab brain should update its shared truth.'
    case 'paper_ref':
      return 'Share this paper reference when it should affect lab-wide research context.'
    case 'hypothesis':
      return 'Keep hypotheses private until you want the Central GBrain to reason over them.'
    case 'note':
      return 'Keep raw notes private unless this should become citeable lab evidence.'
  }
}

export async function createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
  const normalized = await normalizeArtifactInput(input)
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('artifacts')
    .insert(normalized)
    .select()
    .single()

  if (error) throw error

  if (data.tier === 'shared') {
    await ingestSharedArtifact(data)
  }

  return data
}

export async function createArtifacts(inputs: CreateArtifactInput[]): Promise<ArtifactRecord[]> {
  const created: ArtifactRecord[] = []
  for (const input of inputs) {
    created.push(await createArtifact(input))
  }
  return created
}

export async function shareArtifact(id: string): Promise<ShareArtifactResult> {
  const cleanId = requireText(id, 'artifact id', 120)
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('artifacts')
    .update({ tier: 'shared' })
    .eq('id', cleanId)
    .select()
    .single()

  if (error) throw error
  const evidence = await ingestSharedArtifact(data)
  return { artifact: data, evidence }
}

export async function updateArtifactTier(id: string, tier: Tier): Promise<ArtifactRecord> {
  if (!isTier(tier)) throw new Error(`Invalid artifact tier: ${tier}`)
  if (tier === 'shared') return (await shareArtifact(id)).artifact

  const client = supabaseAdmin()
  const { data, error } = await client
    .from('artifacts')
    .update({ tier })
    .eq('id', requireText(id, 'artifact id', 120))
    .select()
    .single()

  if (error) throw error
  return data
}

export async function listResearchers(): Promise<ResearcherRecord[]> {
  const client = supabaseAdmin()
  const { data, error } = await client.from('researchers').select().order('name')
  if (error) throw error
  return data
}

export async function upsertResearcher(input: { name: string; email: string }): Promise<ResearcherRecord> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('researchers')
    .upsert(
      {
        name: requireText(input.name, 'researcher name', 120),
        email: requireText(input.email, 'researcher email', 180).toLowerCase(),
      },
      { onConflict: 'email' },
    )
    .select()
    .single()

  if (error) throw error
  return data
}

async function normalizeArtifactInput(input: CreateArtifactInput): Promise<{
  owner_id: string
  brain_id: string | null
  type: ArtifactType
  tier: Tier
  title: string | null
  content: string
  embedding: number[] | null
}> {
  if (!isArtifactType(input.type)) throw new Error(`Invalid artifact type: ${String(input.type)}`)

  const brain = input.brainId ? null : await ensureDefaultBrain()
  const tier = input.tier ?? defaultTierFor(input.type)
  if (!isTier(tier)) throw new Error(`Invalid artifact tier: ${String(tier)}`)

  const content = requireText(input.content, 'content', 40_000)
  const embedding = await embeddingOrNull({
    content,
    existing: input.embedding ?? null,
  })

  return {
    owner_id: requireText(input.ownerId, 'ownerId', 120),
    brain_id: input.brainId ?? brain?.id ?? null,
    type: input.type,
    tier,
    title: input.title == null || input.title.trim() === '' ? titleFromContent(content) : requireText(input.title, 'title', 180),
    content,
    embedding,
  }
}

async function ingestSharedArtifact(artifact: ArtifactRecord): Promise<EvidenceItem | undefined> {
  const brain = artifact.brain_id ? await getBrain(artifact.brain_id) : await ensureDefaultBrain()
  const source = await ensureResearcherSharedSource(brain.id)
  const run = await startIngestionRun({
    brainId: brain.id,
    sourceId: source.id,
    trigger: 'researcher_share',
  })

  try {
    const { evidence, created } = await createEvidenceItem({
      brainId: brain.id,
      sourceId: source.id,
      ingestionRunId: run.id,
      artifactId: artifact.id,
      sourceKind: 'researcher_shared_artifacts',
      sourceRef: artifact.id,
      title: artifact.title,
      content: artifact.content,
      embedding: artifact.embedding,
    })

    if (created) {
      await createBrainCommit({
        brainId: brain.id,
        ingestionRunId: run.id,
        kind: 'evidence_added',
        summary: `Shared artifact became Central GBrain evidence: ${artifact.title ?? artifact.id}`,
        changes: [
          {
            entityType: 'artifact',
            entityId: artifact.id,
            changeType: 'updated',
            after: { tier: 'shared' },
          },
          {
            entityType: 'evidence',
            entityId: evidence.id,
            changeType: 'created',
            after: { source_kind: 'researcher_shared_artifacts' },
          },
        ],
      })
      await runOpenClawOnEvidence({
        brain,
        evidence,
        ingestionRunId: run.id,
      })
    }

    await finishIngestionRun(run.id, created ? 'succeeded' : 'skipped')
    return evidence
  } catch (error) {
    await finishIngestionRun(run.id, 'failed', error instanceof Error ? error.message : String(error))
    throw error
  }
}

function requireText(value: string, label: string, maxLength: number): string {
  const clean = value.trim()
  if (!clean) throw new Error(`${label} is required`)
  if (clean.length > maxLength) throw new Error(`${label} is too long: ${clean.length} chars, max ${maxLength}`)
  return clean
}

function titleFromContent(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? 'Untitled artifact'
  return firstLine.replace(/^#+\s*/, '').slice(0, 180)
}
