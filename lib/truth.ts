// Minimal truth-maintenance pass for Central GBrain evidence.

import { createBrainCommit } from '@/lib/brain'
import { supabaseAdmin } from '@/lib/supabase'
import type { EvidenceItem, TruthClaim, TruthEvidenceRelationship } from '@/db/client'

type MaintainTruthInput = {
  brainId: string
  evidence: EvidenceItem
  ingestionRunId?: string | null
  decisionId?: string | null
  relationship?: TruthEvidenceRelationship
  rationale?: string
  confidence?: number
}

type MaintainTruthResult = {
  claim: TruthClaim
  created: boolean
}

export async function maintainTruthFromEvidence(input: MaintainTruthInput): Promise<MaintainTruthResult> {
  const statement = statementFromEvidence(input.evidence)
  const confidence = clampConfidence(input.confidence ?? 0.55)
  const relationship = input.relationship ?? 'supports'
  const client = supabaseAdmin()

  const existing = await client
    .from('truth_claims')
    .select()
    .eq('brain_id', input.brainId)
    .eq('statement', statement)
    .maybeSingle()

  if (existing.error) throw existing.error

  if (existing.data) {
    const nextConfidence = nextClaimConfidence(existing.data.confidence, confidence, relationship)
    const nextStatus = relationship === 'contradicts' ? 'contested' : existing.data.status
    const commit = await createBrainCommit({
      brainId: input.brainId,
      ingestionRunId: input.ingestionRunId ?? null,
      kind: commitKindForRelationship(relationship, false),
      summary: `OpenClaw marked evidence as ${relationship} for existing claim: ${shorten(statement, 120)}`,
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
          entityId: existing.data.id,
          changeType: 'updated',
          before: { confidence: existing.data.confidence },
          after: { confidence: nextConfidence },
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
        claim_id: existing.data.id,
        commit_id: commit.id,
        statement,
        confidence: nextConfidence,
        rationale: input.rationale ?? `OpenClaw judged this evidence as ${relationship} for the existing claim.`,
      })
      .select()
      .single()

    if (revision.error) throw revision.error

    const claimUpdate = await client
      .from('truth_claims')
      .update({
        status: nextStatus,
        confidence: nextConfidence,
        current_revision_id: revision.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.data.id)
      .select()
      .single()

    if (claimUpdate.error) throw claimUpdate.error

    await linkEvidence({
      claimId: existing.data.id,
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

function statementFromEvidence(evidence: EvidenceItem): string {
  const title = evidence.title?.trim()
  if (title) return title.slice(0, 280)

  const firstSentence = evidence.content
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim()

  return shorten(firstSentence || evidence.content, 280)
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
