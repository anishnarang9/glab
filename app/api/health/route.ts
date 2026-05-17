import { supabaseAdmin } from '@/lib/supabase'
import { computePendingEvidenceCount, isWorkerHeartbeatFresh } from '@/lib/brain-state'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  const defaultBrainName = process.env.LABBRAIN_DEFAULT_BRAIN_NAME ?? 'LabBrain'

  try {
    const client = supabaseAdmin()
    const { data: brain, error: brainError } = await client
      .from('brains')
      .select('id, name, subject, status')
      .eq('name', defaultBrainName)
      .maybeSingle()

    if (brainError) throw brainError
    if (!brain) throw new Error(`Default brain '${defaultBrainName}' was not found`)

    const [
      sources,
      openClawInstances,
      evidence,
      decisions,
      claims,
      commits,
      latestOperator,
      sourceRows,
      latestRuns,
      sampledEvidence,
      sampledDecisions,
    ] = await Promise.all([
      client.from('brain_sources').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('openclaw_instances').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('evidence_items').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('openclaw_decisions').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('truth_claims').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('brain_commits').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client
        .from('openclaw_instances')
        .select('id, name, status, endpoint_url, last_heartbeat_at')
        .eq('brain_id', brain.id)
        .order('last_heartbeat_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('brain_sources')
        .select('id, kind, label, cadence, enabled, last_checked_at')
        .eq('brain_id', brain.id)
        .order('label'),
      client
        .from('ingestion_runs')
        .select('id, trigger, status, started_at, finished_at, error')
        .eq('brain_id', brain.id)
        .order('started_at', { ascending: false })
        .limit(5),
      client
        .from('evidence_items')
        .select('id')
        .eq('brain_id', brain.id)
        .order('created_at', { ascending: false })
        .limit(1000),
      client
        .from('openclaw_decisions')
        .select('evidence_id')
        .eq('brain_id', brain.id)
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    for (const result of [
      sources,
      openClawInstances,
      evidence,
      decisions,
      claims,
      commits,
      latestOperator,
      sourceRows,
      latestRuns,
      sampledEvidence,
      sampledDecisions,
    ]) {
      if (result.error) throw result.error
    }

    const sampledEvidenceRows = sampledEvidence.data ?? []
    const sampledDecisionRows = sampledDecisions.data ?? []
    const sourceItems = sourceRows.data ?? []
    const staleAfterMs = readIntEnv('OPENCLAW_HEARTBEAT_STALE_MS', readIntEnv('OPENCLAW_POLL_INTERVAL_MS', 60_000, 5_000, 600_000) * 3, 10_000, 3_600_000)
    const heartbeatFresh = isWorkerHeartbeatFresh(latestOperator.data?.last_heartbeat_at ?? null, Date.now(), staleAfterMs)
    const pendingEvidence = computePendingEvidenceCount(
      sampledEvidenceRows.map((item) => item.id),
      sampledDecisionRows.map((decision) => decision.evidence_id),
    )

    return Response.json({
      ok: true,
      service: 'labbrain',
      brain,
      worker: {
        ok: Boolean(latestOperator.data && heartbeatFresh),
        status: latestOperator.data ? latestOperator.data.status : 'missing',
        name: latestOperator.data?.name ?? null,
        endpoint_configured: Boolean(latestOperator.data?.endpoint_url),
        last_heartbeat_at: latestOperator.data?.last_heartbeat_at ?? null,
        heartbeat_fresh: heartbeatFresh,
        stale_after_ms: staleAfterMs,
      },
      pipeline: {
        pending_evidence: pendingEvidence,
        sampled_evidence: sampledEvidenceRows.length,
        latest_runs: latestRuns.data ?? [],
      },
      sources: {
        total: sources.count ?? 0,
        enabled: sourceItems.filter((source) => source.enabled).length,
        items: sourceItems,
      },
      db: {
        ok: true,
        latency_ms: Date.now() - startedAt,
        counts: {
          sources: sources.count ?? 0,
          openclaw_instances: openClawInstances.count ?? 0,
          evidence_items: evidence.count ?? 0,
          openclaw_decisions: decisions.count ?? 0,
          truth_claims: claims.count ?? 0,
          brain_commits: commits.count ?? 0,
        },
      },
    })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: 'labbrain',
        brain: defaultBrainName,
        db: {
          ok: false,
          latency_ms: Date.now() - startedAt,
          error: formatHealthError(error),
        },
      },
      { status: 503 },
    )
  }
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isInteger(raw)) return fallback
  return Math.max(min, Math.min(max, raw))
}

function formatHealthError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [details.message, details.details, details.hint, details.code]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)

    if (parts.length > 0) return parts.join(' | ')

    try {
      return JSON.stringify(error)
    } catch {
      return 'Unknown database health check error'
    }
  }

  return String(error)
}
