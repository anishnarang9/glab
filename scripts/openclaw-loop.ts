// Long-running Railway worker loop for the head Central GBrain OpenClaw operator.

import { fileURLToPath } from 'node:url'
import { ensureDefaultBrain } from '@/lib/brain'
import { dailySourceRefreshRunExists, shouldRunDailySourceRefresh, type DailySourceRefreshRun } from '@/lib/daily-source-refresh'
import { runEmailIngestion } from '@/lib/email-ingestion'
import { ensureHeadGBrainOpenClaw, runOpenClawOnPendingEvidence } from '@/lib/openclaw'
import { runSharedArtifactIngestion } from '@/lib/shared-artifact-ingestion'
import { supabaseAdmin } from '@/lib/supabase'
import { runCentralGBrainIngestion } from '@/scripts/ingest-brain'

async function main(): Promise<void> {
  const intervalMs = readIntervalMs()
  const limit = readLimit()
  let lastDailySourceRefreshKey: string | null = null

  console.log(`OpenClaw worker loop started; interval=${intervalMs}ms limit=${limit}`)

  while (true) {
    try {
      const brain = await ensureDefaultBrain()

      if (dailySourceRefreshEnabled()) {
        const dailyRefresh = shouldRunDailySourceRefresh({ lastRunKey: lastDailySourceRefreshKey })
        if (
          dailyRefresh.shouldRun &&
          !dailySourceRefreshRunExists(await loadRecentSourceRefreshRuns(brain.id), dailyRefresh.runKey)
        ) {
          console.log(`OpenClaw daily research source refresh started; run_key=${dailyRefresh.runKey}`)
          await runCentralGBrainIngestion('source_refresh')
          lastDailySourceRefreshKey = dailyRefresh.runKey
          console.log(`OpenClaw daily research source refresh finished; run_key=${dailyRefresh.runKey}`)
        }
      }

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

function dailySourceRefreshEnabled(): boolean {
  return process.env.OPENCLAW_DAILY_SOURCE_REFRESH_ENABLED !== 'false'
}

async function loadRecentSourceRefreshRuns(brainId: string): Promise<DailySourceRefreshRun[]> {
  const { data, error } = await supabaseAdmin()
    .from('ingestion_runs')
    .select('trigger, status, started_at')
    .eq('brain_id', brainId)
    .eq('trigger', 'source_refresh')
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
