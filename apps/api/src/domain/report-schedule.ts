// When report emails are due (SPEC §12.6, D-074). Pure: the scheduler passes
// the clock in. Times are the shop's wall clock; dates are "YYYY-MM-DD".
//   daily_summary  07:00 for the previous business date. 07:00 is after every
//                  allowed cutoff (0–6), so that business day has closed.
//   weekly_summary Monday 07:30 for the Monday–Sunday before.
// Only the latest period is ever due, so a long outage never sends a backlog;
// the weekly one is dropped if it would go out more than 72 h late.

export type ReportKind = 'daily_summary' | 'weekly_summary'
export type DueReport = { kind: ReportKind; periodStart: string; periodEnd: string }
export type ScheduleShop = { timezone: string; dailyEnabled: boolean; weeklyEnabled: boolean }

const DAILY_AT = 7 * 60
const WEEKLY_AT = 7 * 60 + 30
export const WEEKLY_MAX_LATE_MIN = 72 * 60

const toUtc = (day: string) => new Date(`${day}T00:00:00Z`)
export const addDays = (day: string, n: number): string => {
  const d = toUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// ISO weekday, 1 = Monday … 7 = Sunday.
export const isoWeekday = (day: string): number => ((toUtc(day).getUTCDay() + 6) % 7) + 1

// The shop's local date and minutes since local midnight at `now`.
export const localClock = (now: Date, timezone: string): { date: string; minutes: number } => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    minutes: Number(parts['hour']) * 60 + Number(parts['minute']),
  }
}

export const dueReports = (now: Date, shop: ScheduleShop): DueReport[] => {
  const { date, minutes } = localClock(now, shop.timezone)
  const due: DueReport[] = []
  if (shop.dailyEnabled) {
    // The latest 07:00 at or before now: today's, or yesterday's before 07:00.
    const sentOn = minutes >= DAILY_AT ? date : addDays(date, -1)
    const day = addDays(sentOn, -1)
    due.push({ kind: 'daily_summary', periodStart: day, periodEnd: day })
  }
  if (shop.weeklyEnabled) {
    // The latest Monday 07:30 at or before now.
    const back = isoWeekday(date) - 1
    const monday = back === 0 && minutes < WEEKLY_AT ? addDays(date, -7) : addDays(date, -back)
    const lateMin = (toUtc(date).getTime() - toUtc(monday).getTime()) / 60_000 + minutes - WEEKLY_AT
    if (lateMin <= WEEKLY_MAX_LATE_MIN) {
      due.push({ kind: 'weekly_summary', periodStart: addDays(monday, -7), periodEnd: addDays(monday, -1) })
    }
  }
  return due
}
