import { readFile } from 'node:fs/promises'
import { strict as assert } from 'node:assert'
import { dailySourceRefreshRunExists, shouldRunDailySourceRefresh } from '@/lib/daily-source-refresh'

assert.deepEqual(
  shouldRunDailySourceRefresh({
    now: new Date('2026-05-17T00:59:00.000Z'),
    lastRunKey: null,
  }),
  { shouldRun: false, runKey: '2026-05-16' },
)

assert.deepEqual(
  shouldRunDailySourceRefresh({
    now: new Date('2026-05-17T01:00:00.000Z'),
    lastRunKey: null,
  }),
  { shouldRun: true, runKey: '2026-05-16' },
)

assert.deepEqual(
  shouldRunDailySourceRefresh({
    now: new Date('2026-05-17T01:05:00.000Z'),
    lastRunKey: '2026-05-16',
  }),
  { shouldRun: false, runKey: '2026-05-16' },
)

assert.deepEqual(
  shouldRunDailySourceRefresh({
    now: new Date('2026-12-16T02:00:00.000Z'),
    lastRunKey: null,
  }),
  { shouldRun: true, runKey: '2026-12-15' },
)

assert.equal(
  dailySourceRefreshRunExists([
    {
      trigger: 'source_refresh',
      status: 'succeeded',
      started_at: '2026-05-17T01:03:00.000Z',
    },
  ], '2026-05-16'),
  true,
)

assert.equal(
  dailySourceRefreshRunExists([
    {
      trigger: 'source_refresh',
      status: 'failed',
      started_at: '2026-05-17T01:03:00.000Z',
    },
  ], '2026-05-16'),
  false,
)

const loop = await readFile('scripts/openclaw-loop.ts', 'utf8')
assert(loop.includes('shouldRunDailySourceRefresh'), 'OpenClaw worker loop must own the daily refresh schedule')
assert(loop.includes('dailySourceRefreshRunExists'), 'OpenClaw worker loop must avoid duplicate daily refreshes after restarts')
assert(loop.includes('backfillRecentEvidenceEmbeddings'), 'OpenClaw worker loop must backfill missing evidence embeddings')
assert(loop.includes("runCentralGBrainIngestion('source_refresh')"), 'OpenClaw worker loop must run the research source refresh')

console.log('OpenClaw scheduler verification passed')
