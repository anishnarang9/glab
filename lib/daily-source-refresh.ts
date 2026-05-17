export const PACIFIC_TIME_ZONE = 'America/Los_Angeles'

export type DailySourceRefreshDecision = {
  shouldRun: boolean
  runKey: string
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
