import { describe, expect, it } from 'vitest'
import { dueReports, isoWeekday, localClock } from '../../src/domain/report-schedule.js'

const JKT = { timezone: 'Asia/Jakarta', dailyEnabled: true, weeklyEnabled: true }
// A UTC instant for a Jakarta wall-clock time (UTC+7).
const wib = (local: string) => new Date(new Date(`${local}:00Z`).getTime() - 7 * 3_600_000)

describe('localClock', () => {
  it('reads the shop wall clock', () => {
    expect(localClock(new Date('2026-11-25T23:30:00Z'), 'Asia/Jakarta')).toEqual({
      date: '2026-11-26',
      minutes: 6 * 60 + 30,
    })
    expect(localClock(new Date('2026-11-25T23:30:00Z'), 'Asia/Jayapura')).toEqual({
      date: '2026-11-26',
      minutes: 8 * 60 + 30,
    })
  })
  it('isoWeekday', () => {
    expect(isoWeekday('2026-11-23')).toBe(1) // Monday
    expect(isoWeekday('2026-11-29')).toBe(7)
  })
})

describe('dueReports (SPEC §12.6)', () => {
  it('daily: yesterday from 07:00, the day before until then', () => {
    expect(dueReports(wib('2026-11-26T07:00'), { ...JKT, weeklyEnabled: false })).toEqual([
      { kind: 'daily_summary', periodStart: '2026-11-25', periodEnd: '2026-11-25' },
    ])
    expect(dueReports(wib('2026-11-26T06:59'), { ...JKT, weeklyEnabled: false })).toEqual([
      { kind: 'daily_summary', periodStart: '2026-11-24', periodEnd: '2026-11-24' },
    ])
    // Just before midnight it is still the same day's 07:00 that is latest.
    expect(dueReports(wib('2026-11-26T23:59'), { ...JKT, weeklyEnabled: false })[0]?.periodStart).toBe(
      '2026-11-25',
    )
  })

  it('daily follows the shop time zone', () => {
    // 2026-11-25 23:30 UTC is 07:30 on the 26th in Jayapura (UTC+9) but 06:30 in Jakarta.
    const now = new Date('2026-11-25T23:30:00Z')
    expect(dueReports(now, { timezone: 'Asia/Jayapura', dailyEnabled: true, weeklyEnabled: false })).toEqual([
      { kind: 'daily_summary', periodStart: '2026-11-25', periodEnd: '2026-11-25' },
    ])
    expect(dueReports(now, { ...JKT, weeklyEnabled: false })[0]?.periodStart).toBe('2026-11-24')
  })

  it('weekly: from Monday 07:30, for the Monday–Sunday before', () => {
    const week = { kind: 'weekly_summary', periodStart: '2026-11-23', periodEnd: '2026-11-29' }
    expect(dueReports(wib('2026-11-30T07:30'), { ...JKT, dailyEnabled: false })).toEqual([week])
    expect(dueReports(wib('2026-12-02T12:00'), { ...JKT, dailyEnabled: false })).toEqual([week])
    // Monday before 07:30: the previous week's email is the latest, and 7 days late, so nothing.
    expect(dueReports(wib('2026-11-30T07:29'), { ...JKT, dailyEnabled: false })).toEqual([])
  })

  it('weekly: at most 72 hours late (bounded catch-up)', () => {
    expect(dueReports(wib('2026-12-03T07:30'), { ...JKT, dailyEnabled: false })).toHaveLength(1)
    expect(dueReports(wib('2026-12-03T07:31'), { ...JKT, dailyEnabled: false })).toEqual([])
  })

  it('respects the switches', () => {
    expect(dueReports(wib('2026-11-30T08:00'), JKT).map((d) => d.kind)).toEqual([
      'daily_summary',
      'weekly_summary',
    ])
    expect(
      dueReports(wib('2026-11-30T08:00'), {
        timezone: 'Asia/Jakarta',
        dailyEnabled: false,
        weeklyEnabled: false,
      }),
    ).toEqual([])
  })

  it('rolls over months and years', () => {
    expect(dueReports(wib('2027-01-01T07:00'), { ...JKT, weeklyEnabled: false })[0]?.periodStart).toBe(
      '2026-12-31',
    )
    // Monday 2027-01-04 → week 2026-12-28 … 2027-01-03.
    expect(dueReports(wib('2027-01-04T08:00'), { ...JKT, dailyEnabled: false })).toEqual([
      { kind: 'weekly_summary', periodStart: '2026-12-28', periodEnd: '2027-01-03' },
    ])
  })
})
