import { supabaseAdmin } from '@/lib/supabase'
import type { BrainCommitKind, TruthClaimStatus } from '@/db/client'

export type BrainClaimSummary = {
  id: string
  statement: string
  status: TruthClaimStatus | string
  confidence: number | null
  updated_at: string
}

export type BrainEvidenceSummary = {
  id: string
  title: string | null
  source_kind: string
  source_ref: string | null
  url: string | null
  content?: string
  created_at: string
}

export type BrainCommitSummary = {
  id: string
  kind: BrainCommitKind | string
  summary: string
  created_at: string
}

export type CentralBrainState = {
  claims: BrainClaimSummary[]
  evidence: BrainEvidenceSummary[]
  commits: BrainCommitSummary[]
}

export async function loadCentralBrainState(input: {
  brainId: string
  claims?: number
  evidence?: number
  commits?: number
}): Promise<CentralBrainState> {
  const client = supabaseAdmin()
  const [claims, evidence, commits] = await Promise.all([
    client
      .from('truth_claims')
      .select('id, statement, status, confidence, updated_at')
      .eq('brain_id', input.brainId)
      .order('updated_at', { ascending: false })
      .limit(input.claims ?? 20),
    client
      .from('evidence_items')
      .select('id, title, source_kind, source_ref, url, content, created_at')
      .eq('brain_id', input.brainId)
      .order('created_at', { ascending: false })
      .limit(input.evidence ?? 20),
    client
      .from('brain_commits')
      .select('id, kind, summary, created_at')
      .eq('brain_id', input.brainId)
      .order('created_at', { ascending: false })
      .limit(input.commits ?? 10),
  ])

  for (const result of [claims, evidence, commits]) {
    if (result.error) throw result.error
  }

  return {
    claims: claims.data ?? [],
    evidence: evidence.data ?? [],
    commits: commits.data ?? [],
  }
}

export function buildTruthContext(state: CentralBrainState): string {
  if (state.claims.length === 0 && state.evidence.length === 0 && state.commits.length === 0) {
    return 'No Central GBrain shared truth has been established yet.'
  }

  const claims = state.claims.map((claim) => [
    `[claim:${claim.id}] ${claim.statement}`,
    `Status: ${claim.status}`,
    `Confidence: ${formatConfidence(claim.confidence)}`,
    `Updated: ${claim.updated_at}`,
  ].join('\n'))

  const evidence = state.evidence.map((item) => [
    `[evidence:${item.id}] ${item.title ?? 'Untitled evidence'}`,
    `Source: ${item.source_kind}${item.source_ref ? ` / ${item.source_ref}` : ''}`,
    item.url ? `URL: ${item.url}` : null,
    item.content ? `Excerpt: ${shorten(item.content, 700)}` : null,
  ].filter(Boolean).join('\n'))

  const commits = state.commits.map((commit) => [
    `[commit:${commit.id}] ${commit.kind}`,
    commit.summary,
    `Created: ${commit.created_at}`,
  ].join('\n'))

  return [
    claims.length > 0 ? `CURRENT SHARED TRUTH CLAIMS\n${claims.join('\n\n')}` : null,
    evidence.length > 0 ? `RECENT EVIDENCE\n${evidence.join('\n\n')}` : null,
    commits.length > 0 ? `RECENT BRAIN COMMITS\n${commits.join('\n\n')}` : null,
  ].filter(Boolean).join('\n\n---\n\n')
}

export function computePendingEvidenceCount(evidenceIds: readonly string[], decisionEvidenceIds: readonly (string | null)[]): number {
  const decided = new Set(decisionEvidenceIds.filter((id): id is string => Boolean(id)))
  return evidenceIds.filter((id) => !decided.has(id)).length
}

export function isWorkerHeartbeatFresh(
  lastHeartbeatAt: string | null,
  nowMs = Date.now(),
  staleAfterMs = readStaleAfterMs(),
): boolean {
  if (!lastHeartbeatAt) return false
  const heartbeatMs = Date.parse(lastHeartbeatAt)
  if (!Number.isFinite(heartbeatMs)) return false
  return nowMs - heartbeatMs <= staleAfterMs
}

function readStaleAfterMs(): number {
  const raw = Number(process.env.OPENCLAW_HEARTBEAT_STALE_MS)
  if (Number.isInteger(raw) && raw >= 10_000) return raw

  const interval = Number(process.env.OPENCLAW_POLL_INTERVAL_MS ?? 60_000)
  if (Number.isInteger(interval) && interval >= 5_000) return interval * 3

  return 180_000
}

function formatConfidence(confidence: number | null): string {
  return confidence == null ? 'unknown' : confidence.toFixed(2)
}

function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3)}...`
}
