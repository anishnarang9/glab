import { supabaseAdmin } from '@/lib/supabase'

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

    const [sources, openClawInstances, evidence, decisions, claims, commits] = await Promise.all([
      client.from('brain_sources').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('openclaw_instances').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('evidence_items').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('openclaw_decisions').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('truth_claims').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
      client.from('brain_commits').select('*', { count: 'exact', head: true }).eq('brain_id', brain.id),
    ])

    for (const result of [sources, openClawInstances, evidence, decisions, claims, commits]) {
      if (result.error) throw result.error
    }

    return Response.json({
      ok: true,
      service: 'labbrain',
      brain,
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
