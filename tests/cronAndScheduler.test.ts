import { describe, it, expect } from 'vitest'
import {
  parseCronField,
  resolveCronFields,
  explainCronExpression,
  getNextCronRunDate,
  search as searchCron
} from '../src/main/commands/cron'

describe('Cron Expression Parser & Scheduler Math (cron.ts)', () => {
  it('parses standard 5-field wildcard and step expressions', () => {
    const every15 = resolveCronFields('*/15 * * * *')
    expect(every15).toEqual(['*/15', '*', '*', '*', '*'])
    expect(parseCronField('*/15', 0, 59)).toEqual([0, 15, 30, 45])
    expect(parseCronField('*', 0, 23)).toHaveLength(24)
    expect(parseCronField('*', 1, 31)).toHaveLength(31)
    expect(parseCronField('*', 1, 12)).toHaveLength(12)
    expect(parseCronField('*', 0, 6, true)).toHaveLength(7)
  })

  it('parses ranges, comma-separated lists, and Sunday=7 normalization', () => {
    const fields = resolveCronFields('0,30 9-17 * * 1-5,7')
    expect(fields).toEqual(['0,30', '9-17', '*', '*', '1-5,7'])
    expect(parseCronField(fields![0], 0, 59)).toEqual([0, 30])
    expect(parseCronField(fields![1], 0, 23)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    // 7 should normalize to 0 (Sunday)
    expect(parseCronField(fields![4], 0, 6, true)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('supports @hourly, @daily, @weekly, @monthly, and @yearly macros', () => {
    expect(explainCronExpression('@hourly')).toBe('at minute 0, of every hour')
    expect(explainCronExpression('@daily')).toBe('at minute 0, at hour 0:00')
    expect(explainCronExpression('@weekly')).toBe('at minute 0, at hour 0:00, on day-of-week 0')
    expect(explainCronExpression('@monthly')).toBe('at minute 0, at hour 0:00, on day-of-month 1')
    expect(explainCronExpression('@yearly')).toBe(
      'at minute 0, at hour 0:00, on day-of-month 1, in month 1'
    )
  })

  it('rejects malformed or out-of-range cron expressions', () => {
    expect(resolveCronFields('')).toBeNull()
    expect(resolveCronFields('* * *')).toBeNull()
    expect(resolveCronFields('60 * * * *')).toBeNull()
    expect(resolveCronFields('* 24 * * *')).toBeNull()
    expect(resolveCronFields('* * 0 * *')).toBeNull()
    expect(resolveCronFields('* * * 13 *')).toBeNull()
    expect(resolveCronFields('*/0 * * * *')).toBeNull()
    expect(getNextCronRunDate('invalid cron')).toBeNull()
  })

  it('calculates the exact next execution timestamp from a reference date', () => {
    // Monday, Nov 9, 2026 10:12:30 local time
    const refDate = new Date(2026, 10, 9, 10, 12, 30, 0)

    const next15 = getNextCronRunDate('*/15 * * * *', refDate)
    expect(next15).not.toBeNull()
    expect(next15!.getFullYear()).toBe(2026)
    expect(next15!.getMonth()).toBe(10)
    expect(next15!.getDate()).toBe(9)
    expect(next15!.getHours()).toBe(10)
    expect(next15!.getMinutes()).toBe(15)
    expect(next15!.getSeconds()).toBe(0)

    // Next weekday 9:00 AM after Monday 10:12 AM -> Tuesday Nov 10, 2026 09:00 AM
    const nextWeekday9am = getNextCronRunDate('0 9 * * 1-5', refDate)
    expect(nextWeekday9am).not.toBeNull()
    expect(nextWeekday9am!.getDate()).toBe(10)
    expect(nextWeekday9am!.getHours()).toBe(9)
    expect(nextWeekday9am!.getMinutes()).toBe(0)
  })

  it('returns human explanation, /jobs shortcut, and 5 upcoming runs from search()', () => {
    const items = searchCron('*/15 * * * *')
    expect(items.length).toBe(7)
    expect(items[0].label).toContain('every 15 minutes')
    expect(items[1].completion).toBe('/jobs ')
    expect(items[2].label).toMatch(/^Run #1:/)
  })
})
