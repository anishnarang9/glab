// Minimal truth-maintenance pass for Central GBrain evidence.

import { createBrainCommit } from '@/lib/brain'
import { supabaseAdmin } from '@/lib/supabase'
import type { EvidenceItem, TruthClaim, TruthEvidenceRelationship } from '@/db/client'

type MaintainTruthInput = {
  brainId: string
  evidence: EvidenceItem
  ingestionRunId?: string | null
  decisionId?: string | null
  statement?: string | null
  relationship?: TruthEvidenceRelationship
  rationale?: string
  confidence?: number
}

type MaintainTruthResult = {
  claim: TruthClaim
  created: boolean
}

export async function maintainTruthFromEvidence(input: MaintainTruthInput): Promise<MaintainTruthResult> {
  const statement = selectClaimStatement({
    evidence: input.evidence,
    preferredStatement: input.statement,
  })
  const confidence = clampConfidence(input.confidence ?? 0.55)
  const relationship = input.relationship ?? 'supports'
  const client = supabaseAdmin()

  const existingClaims = await client
    .from('truth_claims')
    .select()
    .eq('brain_id', input.brainId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (existingClaims.error) throw existingClaims.error

  const existing = findBestClaimForStatement(statement, existingClaims.data)

  if (existing) {
    const nextConfidence = nextClaimConfidence(existing.confidence, confidence, relationship)
    const nextStatus = relationship === 'contradicts' ? 'contested' : existing.status
    const nextStatement = relationship === 'refines' && statement !== existing.statement ? statement : existing.statement
    const commit = await createBrainCommit({
      brainId: input.brainId,
      ingestionRunId: input.ingestionRunId ?? null,
      kind: commitKindForRelationship(relationship, false),
      summary: `OpenClaw marked evidence as ${relationship} for existing claim: ${shorten(nextStatement, 120)}`,
      changes: [
        ...(input.decisionId
          ? [{
              entityType: 'decision' as const,
              entityId: input.decisionId,
              changeType: 'linked' as const,
              after: { relationship },
            }]
          : []),
        {
          entityType: 'claim',
          entityId: existing.id,
          changeType: 'updated',
          before: { confidence: existing.confidence, statement: existing.statement },
          after: { confidence: nextConfidence, statement: nextStatement },
        },
        {
          entityType: 'evidence',
          entityId: input.evidence.id,
          changeType: 'linked',
          after: { relationship },
        },
      ],
    })

    const revision = await client
      .from('truth_revisions')
      .insert({
        claim_id: existing.id,
        commit_id: commit.id,
        statement: nextStatement,
        confidence: nextConfidence,
        rationale: input.rationale ?? `OpenClaw judged this evidence as ${relationship} for the existing claim.`,
      })
      .select()
      .single()

    if (revision.error) throw revision.error

    const claimUpdate = await client
      .from('truth_claims')
      .update({
        statement: nextStatement,
        status: nextStatus,
        confidence: nextConfidence,
        current_revision_id: revision.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (claimUpdate.error) throw claimUpdate.error

    await linkEvidence({
      claimId: existing.id,
      evidenceId: input.evidence.id,
      relationship,
      rationale: input.rationale ?? `OpenClaw judged this evidence as ${relationship}.`,
      confidence,
    })

    return { claim: claimUpdate.data, created: false }
  }

  const claimInsert = await client
    .from('truth_claims')
    .insert({
      brain_id: input.brainId,
      statement,
      status: relationship === 'contradicts' ? 'contested' : 'active',
      confidence,
    })
    .select()
    .single()

  if (claimInsert.error) throw claimInsert.error

  const commit = await createBrainCommit({
    brainId: input.brainId,
    ingestionRunId: input.ingestionRunId ?? null,
    kind: commitKindForRelationship(relationship, true),
    summary: `OpenClaw created claim from ${relationship} evidence: ${shorten(statement, 120)}`,
    changes: [
      ...(input.decisionId
        ? [{
            entityType: 'decision' as const,
            entityId: input.decisionId,
            changeType: 'linked' as const,
            after: { relationship },
          }]
        : []),
      {
        entityType: 'claim',
        entityId: claimInsert.data.id,
        changeType: 'created',
        after: {
          statement,
          confidence,
        },
      },
      {
        entityType: 'evidence',
        entityId: input.evidence.id,
        changeType: 'linked',
        after: {
          relationship,
        },
      },
    ],
  })

  const revision = await client
    .from('truth_revisions')
    .insert({
      claim_id: claimInsert.data.id,
      commit_id: commit.id,
      statement,
      confidence,
      rationale: input.rationale ?? `Initial claim extracted after OpenClaw judged the evidence as ${relationship}.`,
    })
    .select()
    .single()

  if (revision.error) throw revision.error

  const claimUpdate = await client
    .from('truth_claims')
    .update({
      current_revision_id: revision.data.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimInsert.data.id)
    .select()
    .single()

  if (claimUpdate.error) throw claimUpdate.error

  await linkEvidence({
    claimId: claimInsert.data.id,
    evidenceId: input.evidence.id,
    relationship,
    rationale: input.rationale ?? `OpenClaw judged this evidence as ${relationship}.`,
    confidence,
  })

  return { claim: claimUpdate.data, created: true }
}

async function linkEvidence(input: {
  claimId: string
  evidenceId: string
  relationship: TruthEvidenceRelationship
  rationale: string
  confidence: number
}): Promise<void> {
  const client = supabaseAdmin()
  const { error } = await client.from('truth_evidence_edges').insert({
    claim_id: input.claimId,
    evidence_id: input.evidenceId,
    relationship: input.relationship,
    rationale: input.rationale,
    confidence: input.confidence,
  })

  if (error) throw error
}

export function selectClaimStatement(input: {
  evidence: Pick<EvidenceItem, 'title' | 'content'>
  preferredStatement?: string | null
}): string {
  const preferred = cleanStatement(input.preferredStatement ?? '')
  if (preferred) return shorten(preferred, 280)

  return statementFromEvidence(input.evidence)
}

export function findBestClaimForStatement<T extends Pick<TruthClaim, 'id' | 'statement'>>(
  statement: string,
  claims: readonly T[],
): T | null {
  const targetKey = normalizeClaimKey(statement)
  if (!targetKey) return null

  let best: { claim: T; score: number } | null = null
  for (const claim of claims) {
    const claimKey = normalizeClaimKey(claim.statement)
    if (!claimKey) continue
    if (claimKey === targetKey) return claim

    const score = tokenSimilarity(targetKey, claimKey)
    if (!best || score > best.score) best = { claim, score }
  }

  return best && best.score >= 0.5 ? best.claim : null
}

function statementFromEvidence(evidence: Pick<EvidenceItem, 'title' | 'content'>): string {
  const title = evidence.title?.trim()
  if (title) return title.slice(0, 280)

  const firstSentence = evidence.content
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim()

  return shorten(firstSentence || evidence.content, 280)
}

function normalizeClaimKey(statement: string): string {
  return claimTokens(statement).join(' ')
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }

  const union = new Set([...leftTokens, ...rightTokens]).size
  if (intersection < 3) return 0
  return intersection / union
}

function claimTokens(statement: string): string[] {
  const stopwords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'that',
    'the',
    'to',
    'with',
  ])

  return cleanStatement(statement)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/s$/, ''))
    .filter((token) => token.length > 2 && !stopwords.has(token))
}

function cleanStatement(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function nextClaimConfidence(
  currentConfidence: number | null,
  evidenceConfidence: number,
  relationship: TruthEvidenceRelationship,
): number {
  const current = currentConfidence ?? 0
  if (relationship === 'contradicts') return clampConfidence(Math.min(current || 0.5, 1 - evidenceConfidence * 0.5))
  if (relationship === 'refines') return clampConfidence(Math.max(current, evidenceConfidence) + 0.03)
  return clampConfidence(Math.max(current, evidenceConfidence))
}

function commitKindForRelationship(relationship: TruthEvidenceRelationship, created: boolean) {
  if (created) return 'claim_created'
  if (relationship === 'contradicts') return 'claim_contradicted'
  if (relationship === 'refines') return 'claim_refined'
  return 'claim_supported'
}

function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3)}...`
}
