// Long-running Railway worker loop for the head Central GBrain OpenClaw operator.

import { ensureDefaultBrain } from '@/lib/brain'
import { runEmailIngestion } from '@/lib/email-ingestion'
import { ensureHeadGBrainOpenClaw, runOpenClawOnPendingEvidence } from '@/lib/openclaw'
import { runSharedArtifactIngestion } from '@/lib/shared-artifact-ingestion'

async function main(): Promise<void> {
  const intervalMs = readIntervalMs()
  const limit = readLimit()

  console.log(`OpenClaw worker loop started; interval=${intervalMs}ms limit=${limit}`)

  while (true) {
    try {
      const sharedSummary = await runSharedArtifactIngestion({ trigger: 'openclaw_worker' })
      if (sharedSummary.enabled && (sharedSummary.ingested > 0 || sharedSummary.errors.length > 0)) {
        console.log(`Shared artifact ingestion: scanned=${sharedSummary.scanned} pending=${sharedSummary.pending} ingested=${sharedSummary.ingested} skipped=${sharedSummary.skipped}`)
        for (const message of sharedSummary.errors) console.error(`Shared artifact ingestion error: ${message}`)
      }

      const emailSummary = await runEmailIngestion()
      if (emailSummary.enabled && (emailSummary.ingested > 0 || emailSummary.errors.length > 0)) {
        console.log(`Email ingestion: ingested=${emailSummary.ingested} skipped=${emailSummary.skipped} marked_read=${emailSummary.markedRead}`)
        for (const message of emailSummary.errors) console.error(`Email ingestion error: ${message}`)
      }

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
