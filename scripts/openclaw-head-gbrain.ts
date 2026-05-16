// Railway worker entrypoint for the Glab head Central GBrain OpenClaw operator.

import { fileURLToPath } from 'node:url'
import { ensureDefaultBrain, finishIngestionRun, startIngestionRun } from '@/lib/brain'
import { ensureHeadGBrainOpenClaw, runOpenClawOnPendingEvidence } from '@/lib/openclaw'
import { runCentralGBrainIngestion } from '@/scripts/ingest-brain'

async function main(): Promise<void> {
  const pendingOnly = args().includes('--pending-only')
  const brain = await ensureDefaultBrain()
  const operator = await ensureHeadGBrainOpenClaw(brain.id)

  if (!pendingOnly) {
    await runCentralGBrainIngestion('openclaw_worker')
  }

  const run = await startIngestionRun({
    brainId: brain.id,
    trigger: 'openclaw_worker',
  })

  try {
    const processed = await runOpenClawOnPendingEvidence({
      brain,
      ingestionRun: run,
      limit: readLimit(),
    })
    await finishIngestionRun(run.id, processed > 0 ? 'succeeded' : 'skipped')
    console.log(`${operator.name}: processed ${processed} pending OpenClaw decision${processed === 1 ? '' : 's'}`)
  } catch (error) {
    await finishIngestionRun(run.id, 'failed', error instanceof Error ? error.message : String(error))
    throw error
  }
}

function args(): string[] {
  return process.argv.slice(2)
}

function readLimit(): number {
  const index = args().indexOf('--limit')
  if (index === -1) return 50
  const value = Number(args()[index + 1])
  if (!Number.isInteger(value) || value < 1 || value > 500) throw new Error('Invalid --limit; expected 1-500')
  return value
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
