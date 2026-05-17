// OpenClaw operator for the head Central GBrain.

import { createBrainCommit } from '@/lib/brain'
import { supabaseAdmin } from '@/lib/supabase'
import { maintainTruthFromEvidence } from '@/lib/truth'
import type {
  Brain,
  EvidenceItem,
  IngestionRun,
  Json,
  OpenClawDecision,
  OpenClawDecisionType,
  OpenClawInstance,
  TruthEvidenceRelationship,
} from '@/db/client'

export type EvidenceObservation = {
  brain: Pick<Brain, 'id' | 'name' | 'subject' | 'mission'>
  evidence: Pick<EvidenceItem, 'id' | 'source_kind' | 'source_ref' | 'title' | 'content' | 'url' | 'published_at'>
  currentClaims: ReadonlyArray<{
    id: string
    statement: string
    status: string
    confidence: number | null
    updated_at: string
  }>
  recentCommits: ReadonlyArray<{
    id: string
    kind: string
    summary: string
    created_at: string
  }>
}

export type OpenClawEvidenceDecision = {
  decisionType: OpenClawDecisionType
  subject: string
  rationale: string
  confidence: number
  relationship?: TruthEvidenceRelationship
  payload?: Json
}

type RunOpenClawInput = {
  brain: Brain | Pick<Brain, 'id' | 'name' | 'subject' | 'mission'>
  evidence: EvidenceItem
  ingestionRunId?: string | null
}

type RunOpenClawResult = {
  decision: OpenClawDecision
  applied: boolean
}

export async function ensureHeadGBrainOpenClaw(brainId: string): Promise<OpenClawInstance> {
  const name = process.env.OPENCLAW_OPERATOR_NAME ?? 'Glab Head GBrain OpenClaw'
  const endpoint = process.env.OPENCLAW_HEAD_GBRAIN_URL?.trim() || null
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('openclaw_instances')
    .upsert(
      {
        brain_id: brainId,
        name,
        role: 'head_gbrain_operator',
        endpoint_url: endpoint,
        status: 'active',
        access_scope: {
          mode: 'railway_worker_service_role',
          reads: ['brains', 'brain_sources', 'evidence_items', 'truth_claims', 'brain_commits'],
          writes: ['ingestion_runs', 'openclaw_decisions', 'truth_revisions', 'truth_evidence_edges', 'brain_commits'],
        },
        last_heartbeat_at: new Date().toISOString(),
      },
      { onConflict: 'brain_id,name' },
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function runOpenClawOnEvidence(input: RunOpenClawInput): Promise<RunOpenClawResult> {
  const instance = await ensureHeadGBrainOpenClaw(input.brain.id)
  const observation = await buildEvidenceObservation(input.brain, input.evidence)
  const proposed = await decideWithOpenClaw(observation)
  const decision = await recordOpenClawDecision({
    brainId: input.brain.id,
    instanceId: instance.id,
    ingestionRunId: input.ingestionRunId ?? null,
    evidenceId: input.evidence.id,
    proposed,
  })

  try {
    const changedTruth = await applyOpenClawDecision({
      brainId: input.brain.id,
      instanceId: instance.id,
      ingestionRunId: input.ingestionRunId ?? null,
      evidence: input.evidence,
      decision,
    })
    const updated = await markDecision(decision.id, 'applied')
    return { decision: updated, applied: changedTruth }
  } catch (error) {
    await markDecision(decision.id, 'failed', error instanceof Error ? error.message : String(error))
    throw error
  }
}

export async function runOpenClawOnPendingEvidence(input: {
  brain: Brain
  ingestionRun?: IngestionRun | null
  limit?: number
}): Promise<number> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('evidence_items')
    .select()
    .eq('brain_id', input.brain.id)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50)

  if (error) throw error

  let processedCount = 0
  for (const evidence of data) {
    const alreadyDecided = await client
      .from('openclaw_decisions')
      .select('id')
      .eq('evidence_id', evidence.id)
      .limit(1)
      .maybeSingle()

    if (alreadyDecided.error) throw alreadyDecided.error
    if (alreadyDecided.data) continue

    const result = await runOpenClawOnEvidence({
      brain: input.brain,
      evidence,
      ingestionRunId: input.ingestionRun?.id ?? null,
    })
    if (result.decision.status === 'applied') processedCount += 1
  }

  return processedCount
}

async function buildEvidenceObservation(
  brain: Pick<Brain, 'id' | 'name' | 'subject' | 'mission'>,
  evidence: EvidenceItem,
): Promise<EvidenceObservation> {
  const client = supabaseAdmin()
  const claims = await client
    .from('truth_claims')
    .select('id, statement, status, confidence, updated_at')
    .eq('brain_id', brain.id)
    .order('updated_at', { ascending: false })
    .limit(25)

  if (claims.error) throw claims.error

  const commits = await client
    .from('brain_commits')
    .select('id, kind, summary, created_at')
    .eq('brain_id', brain.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (commits.error) throw commits.error

  return {
    brain,
    evidence: {
      id: evidence.id,
      source_kind: evidence.source_kind,
      source_ref: evidence.source_ref,
      title: evidence.title,
      content: evidence.content,
      url: evidence.url,
      published_at: evidence.published_at,
    },
    currentClaims: claims.data,
    recentCommits: commits.data,
  }
}

async function decideWithOpenClaw(observation: EvidenceObservation): Promise<OpenClawEvidenceDecision> {
  const endpoint = process.env.OPENCLAW_HEAD_GBRAIN_URL?.trim()
  if (!endpoint) return localOpenClawPolicy(observation)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OPENCLAW_HEAD_GBRAIN_TOKEN
          ? { Authorization: `Bearer ${process.env.OPENCLAW_HEAD_GBRAIN_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        operator: process.env.OPENCLAW_OPERATOR_NAME ?? 'Glab Head GBrain OpenClaw',
        task: 'decide_evidence_relevance',
        observation,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenClaw decision endpoint failed: ${response.status} ${response.statusText}`)
    }

    const body = await response.json() as unknown
    return normalizeRemoteDecision(body, observation)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (process.env.OPENCLAW_REMOTE_REQUIRED === 'true') throw error
    return localOpenClawPolicy(observation, message)
  }
}

export function localOpenClawPolicy(
  observation: EvidenceObservation,
  fallbackReason?: string,
): OpenClawEvidenceDecision {
  const title = observation.evidence.title?.trim()
  const content = observation.evidence.content.replace(/\s+/g, ' ').trim()
  const subject = title || shorten(content, 140)

  if (content.length < 80) {
    return {
      decisionType: 'skip',
      subject,
      rationale: 'OpenClaw skipped this item because it is too short to support shared truth.',
      confidence: 0.8,
      payload: localDecisionPayload({ reason: 'too_short' }, fallbackReason),
    }
  }

  const relationship = relationshipFromText(content)
  return {
    decisionType: decisionTypeForRelationship(relationship),
    subject,
    rationale: `OpenClaw accepted this ${observation.evidence.source_kind} item as broadly relevant to ${observation.brain.subject}.`,
    confidence: 0.62,
    relationship,
    payload: localDecisionPayload({
      relationship,
      source_kind: observation.evidence.source_kind,
      source_ref: observation.evidence.source_ref,
    }, fallbackReason),
  }
}

export function normalizeRemoteDecision(body: unknown, observation: EvidenceObservation): OpenClawEvidenceDecision {
  const obj = asObject(body)
  const rawDecision = asObject(obj.decision ?? obj)
  const decisionType = normalizeDecisionType(rawDecision.decisionType ?? rawDecision.decision_type)
  const relationship = normalizeRelationship(rawDecision.relationship ?? asObject(rawDecision.payload).relationship)
  const payload = asObject(rawDecision.payload)
  const normalizedStatement =
    readString(rawDecision.normalizedClaim) ||
    readString(rawDecision.normalized_claim) ||
    readString(rawDecision.normalizedStatement) ||
    readString(rawDecision.normalized_statement) ||
    readString(rawDecision.claim) ||
    readString(rawDecision.statement) ||
    readString(payload.normalized_statement) ||
    readString(payload.normalized_claim) ||
    null
  const subject = normalizedStatement || readString(rawDecision.subject) || observation.evidence.title || shorten(observation.evidence.content, 140)
  const rationale = readString(rawDecision.rationale) || 'OpenClaw accepted the evidence for Central GBrain truth maintenance.'
  const confidence = clampConfidence(readNumber(rawDecision.confidence) ?? 0.6)

  return {
    decisionType,
    subject,
    rationale,
    confidence,
    relationship: relationship ?? relationshipForDecisionType(decisionType),
    payload: mergePayload(payload, {
      decision_mode: 'remote_openclaw',
      normalized_statement: subject,
    }),
  }
}

async function recordOpenClawDecision(input: {
  brainId: string
  instanceId: string
  ingestionRunId: string | null
  evidenceId: string
  proposed: OpenClawEvidenceDecision
}): Promise<OpenClawDecision> {
  const client = supabaseAdmin()
  const payload = mergePayload(input.proposed.payload, {
    relationship: input.proposed.relationship,
    normalized_statement: input.proposed.subject,
  })
  const { data, error } = await client
    .from('openclaw_decisions')
    .insert({
      brain_id: input.brainId,
      instance_id: input.instanceId,
      ingestion_run_id: input.ingestionRunId,
      evidence_id: input.evidenceId,
      decision_type: input.proposed.decisionType,
      subject: input.proposed.subject,
      rationale: input.proposed.rationale,
      confidence: input.proposed.confidence,
      payload,
      status: 'proposed',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

async function applyOpenClawDecision(input: {
  brainId: string
  instanceId: string
  ingestionRunId: string | null
  evidence: EvidenceItem
  decision: OpenClawDecision
}): Promise<boolean> {
  if (input.decision.decision_type === 'skip' || input.decision.decision_type === 'request_human_review') {
    await createBrainCommit({
      brainId: input.brainId,
      ingestionRunId: input.ingestionRunId,
      kind: 'openclaw_decision',
      summary: `OpenClaw did not apply evidence: ${shorten(input.decision.subject, 120)}`,
      changes: [
        {
          entityType: 'operator',
          entityId: input.instanceId,
          changeType: 'linked',
          after: { role: 'head_gbrain_operator' },
        },
        {
          entityType: 'decision',
          entityId: input.decision.id,
          changeType: 'skipped',
          after: { decision_type: input.decision.decision_type },
        },
        {
          entityType: 'evidence',
          entityId: input.evidence.id,
          changeType: 'skipped',
          after: { reason: input.decision.rationale },
        },
      ],
    })
    return false
  }

  const relationship = relationshipForDecision(input.decision)
  await createBrainCommit({
    brainId: input.brainId,
    ingestionRunId: input.ingestionRunId,
    kind: 'openclaw_decision',
    summary: `OpenClaw accepted evidence for truth maintenance: ${shorten(input.decision.subject, 120)}`,
    changes: [
      {
        entityType: 'operator',
        entityId: input.instanceId,
        changeType: 'linked',
        after: { role: 'head_gbrain_operator' },
      },
      {
        entityType: 'decision',
        entityId: input.decision.id,
        changeType: 'created',
        after: {
          decision_type: input.decision.decision_type,
          relationship,
          confidence: input.decision.confidence,
        },
      },
      {
        entityType: 'evidence',
        entityId: input.evidence.id,
        changeType: 'linked',
        after: { relationship },
      },
    ],
  })

  await maintainTruthFromEvidence({
    brainId: input.brainId,
    evidence: input.evidence,
    ingestionRunId: input.ingestionRunId,
    decisionId: input.decision.id,
    statement: input.decision.subject,
    relationship,
    rationale: input.decision.rationale ?? undefined,
    confidence: input.decision.confidence ?? undefined,
  })

  return true
}

async function markDecision(
  decisionId: string,
  status: 'applied' | 'rejected' | 'failed',
  errorMessage?: string,
): Promise<OpenClawDecision> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('openclaw_decisions')
    .update({
      status,
      applied_at: status === 'failed' ? null : new Date().toISOString(),
      error: errorMessage ?? null,
    })
    .eq('id', decisionId)
    .select()
    .single()

  if (error) throw error
  return data
}

function relationshipFromText(content: string): TruthEvidenceRelationship {
  if (/\b(contradict|inconsistent|fails to|does not|no significant|not improve|negative result)\b/i.test(content)) {
    return 'contradicts'
  }
  if (/\b(refine|extends|extension|improves|new method|novel|updates|revises)\b/i.test(content)) {
    return 'refines'
  }
  return 'supports'
}

function decisionTypeForRelationship(relationship: TruthEvidenceRelationship): OpenClawDecisionType {
  if (relationship === 'contradicts') return 'claim_contradicted'
  if (relationship === 'refines') return 'claim_refined'
  return 'claim_supported'
}

function relationshipForDecision(decision: OpenClawDecision): TruthEvidenceRelationship {
  const payloadRelationship = normalizeRelationship(asObject(decision.payload).relationship)
  if (payloadRelationship) return payloadRelationship
  return relationshipForDecisionType(decision.decision_type)
}

function relationshipForDecisionType(decisionType: OpenClawDecisionType): TruthEvidenceRelationship {
  if (decisionType === 'claim_contradicted') return 'contradicts'
  if (decisionType === 'claim_refined') return 'refines'
  return 'supports'
}

function normalizeDecisionType(value: unknown): OpenClawDecisionType {
  if (
    value === 'ingest' ||
    value === 'skip' ||
    value === 'claim_created' ||
    value === 'claim_supported' ||
    value === 'claim_contradicted' ||
    value === 'claim_refined' ||
    value === 'request_human_review'
  ) return value

  return 'ingest'
}

function normalizeRelationship(value: unknown): TruthEvidenceRelationship | undefined {
  if (
    value === 'supports' ||
    value === 'contradicts' ||
    value === 'refines' ||
    value === 'duplicates' ||
    value === 'background' ||
    value === 'orthogonal'
  ) return value

  return undefined
}

function mergePayload(payload: Json | undefined, extra: Record<string, Json | undefined>): Json {
  return {
    ...asObject(payload),
    ...extra,
  }
}

function localDecisionPayload(payload: Record<string, Json | undefined>, fallbackReason?: string): Json {
  return mergePayload(payload, {
    decision_mode: 'local_openclaw_fallback',
    policy: 'local_openclaw_fallback',
    fallback_reason: fallbackReason,
  })
}

function asObject(value: unknown): Record<string, Json | undefined> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {}
}

function readString(value: Json | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3)}...`
}
