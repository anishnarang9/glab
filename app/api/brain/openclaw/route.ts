import { ensureDefaultBrain, finishIngestionRun, startIngestionRun } from '@/lib/brain'
import { runOpenClawOnEvidence, runOpenClawOnPendingEvidence } from '@/lib/openclaw'
import { supabaseAdmin } from '@/lib/supabase'

type OpenClawAction = 'pending' | 'evidence'

export async function POST(req: Request) {
  const auth = authorizeWorker(req)
  if (auth) return auth

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = parseAction(body.action)
  const brain = await ensureDefaultBrain()

  if (action === 'evidence') {
    const evidenceId = readString(body.evidence_id)
    if (!evidenceId) return Response.json({ error: 'evidence_id is required' }, { status: 400 })

    const evidence = await loadEvidence(evidenceId)
    if (evidence.brain_id !== brain.id) return Response.json({ error: 'Evidence does not belong to the head Central GBrain' }, { status: 400 })

    const result = await runOpenClawOnEvidence({
      brain,
      evidence,
      ingestionRunId: null,
    })
    return Response.json({ decision: result.decision, applied: result.applied })
  }

  const run = await startIngestionRun({
    brainId: brain.id,
    trigger: 'openclaw_worker',
  })

  try {
    const processed = await runOpenClawOnPendingEvidence({
      brain,
      ingestionRun: run,
      limit: readLimit(body.limit),
    })
    await finishIngestionRun(run.id, processed > 0 ? 'succeeded' : 'skipped')
    return Response.json({ run_id: run.id, processed })
  } catch (error) {
    await finishIngestionRun(run.id, 'failed', error instanceof Error ? error.message : String(error))
    throw error
  }
}

function authorizeWorker(req: Request): Response | null {
  const expected = process.env.LABBRAIN_WORKER_TOKEN
  if (!expected) return Response.json({ error: 'LABBRAIN_WORKER_TOKEN is not configured' }, { status: 500 })

  const header = req.headers.get('authorization') ?? ''
  if (header !== `Bearer ${expected}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  return null
}

function parseAction(value: unknown): OpenClawAction {
  return value === 'evidence' ? 'evidence' : 'pending'
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readLimit(value: unknown): number {
  if (value == null) return 50
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error('Invalid limit; expected integer 1-500')
  }
  return value
}

async function loadEvidence(evidenceId: string) {
  const { data, error } = await supabaseAdmin()
    .from('evidence_items')
    .select()
    .eq('id', evidenceId)
    .single()

  if (error) throw error
  return data
}
