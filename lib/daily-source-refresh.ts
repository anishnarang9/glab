export const PACIFIC_TIME_ZONE = 'America/Los_Angeles'

export type DailySourceRefreshDecision = {
  shouldRun: boolean
  runKey: string
}

export type DailySourceRefreshRun = {
  trigger: string
  status: string
  started_at: string
}

export function shouldRunDailySourceRefresh(input: {
  now?: Date
  lastRunKey: string | null
  hour?: number
  minute?: number
  timeZone?: string
}): DailySourceRefreshDecision {
  const parts = zonedParts(input.now ?? new Date(), input.timeZone ?? PACIFIC_TIME_ZONE)
  const runKey = `${parts.year}-${parts.month}-${parts.day}`
  const targetHour = input.hour ?? 18
  const targetMinute = input.minute ?? 0
  const reachedTarget =
    parts.hour > targetHour ||
    (parts.hour === targetHour && parts.minute >= targetMinute)

  return {
    runKey,
    shouldRun: reachedTarget && input.lastRunKey !== runKey,
  }
}

export function dailySourceRefreshRunExists(runs: DailySourceRefreshRun[], runKey: string, now = new Date()): boolean {
  return runs.some((run) =>
    run.trigger === 'source_refresh' &&
    run.status !== 'failed' &&
    !isStaleRunningRefresh(run, now) &&
    pacificDateKey(new Date(run.started_at)) === runKey,
  )
}

export function pacificDateKey(date: Date, timeZone = PACIFIC_TIME_ZONE): string {
  const parts = zonedParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function zonedParts(date: Date, timeZone: string): {
  year: string
  month: string
  day: string
  hour: number
  minute: number
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    year: requiredPart(parts, 'year'),
    month: requiredPart(parts, 'month'),
    day: requiredPart(parts, 'day'),
    hour: Number(requiredPart(parts, 'hour')),
    minute: Number(requiredPart(parts, 'minute')),
  }
}

function requiredPart(parts: Record<string, string>, key: string): string {
  const value = parts[key]
  if (!value) throw new Error(`Could not resolve ${key} for daily source refresh schedule`)
  return value
}

function isStaleRunningRefresh(run: DailySourceRefreshRun, now: Date): boolean {
  if (run.status !== 'running') return false
  const maxRunningMs = readIntEnv('GBRAIN_SOURCE_REFRESH_MAX_RUNNING_MS', 15 * 60_000, 60_000, 60 * 60_000)
  return now.getTime() - new Date(run.started_at).getTime() > maxRunningMs
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isInteger(raw)) return fallback
  return Math.max(min, Math.min(max, raw))
}
