// Long-running Railway worker loop for the head Central GBrain OpenClaw operator.

import { ensureDefaultBrain } from '@/lib/brain'
import { ensureHeadGBrainOpenClaw, runOpenClawOnPendingEvidence } from '@/lib/openclaw'

async function main(): Promise<void> {
  const intervalMs = readIntervalMs()
  const limit = readLimit()

  console.log(`OpenClaw worker loop started; interval=${intervalMs}ms limit=${limit}`)

  while (true) {
    try {
      const brain = await ensureDefaultBrain()
      const operator = await ensureHeadGBrainOpenClaw(brain.id)
      const processed = await runOpenClawOnPendingEvidence({ brain, limit })
      if (processed > 0) {
        console.log(`${operator.name}: processed ${processed} pending decision${processed === 1 ? '' : 's'}`)
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }

    await sleep(intervalMs)
  }
}

function readIntervalMs(): number {
  const raw = Number(process.env.OPENCLAW_POLL_INTERVAL_MS ?? 60_000)
  if (!Number.isFinite(raw) || raw < 5_000) return 60_000
  return raw
}

function readLimit(): number {
  const raw = Number(process.env.OPENCLAW_PENDING_LIMIT ?? 50)
  if (!Number.isInteger(raw) || raw < 1 || raw > 500) return 50
  return raw
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
