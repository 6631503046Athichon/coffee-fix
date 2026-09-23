/**
 * Tests for parseDateOnly — anchors YYYY-MM-DD inputs at 12:00 UTC so
 * timezone shifts of ±11h still display the same calendar date.
 */

import { describe, test, expect } from '@jest/globals'

describe('parseDateOnly', () => {
  test('anchors YYYY-MM-DD at 12:00 UTC', async () => {
    const { parseDateOnly } = await import('@/lib/utils')
    const d = parseDateOnly('2026-04-25')

    expect(d).toBeInstanceOf(Date)
    expect(d!.toISOString()).toBe('2026-04-25T12:00:00.000Z')
  })

  test('the picked date survives in every realistic timezone', async () => {
    const { parseDateOnly } = await import('@/lib/utils')
    const d = parseDateOnly('2026-04-25')!

    // Spot-check at the extremes of coffee-growing regions.
    // toLocaleDateString with explicit timeZone formats the same instant
    // in another zone — if our anchor is 12:00 UTC the calendar date stays
    // 2026-04-25 from -11 (Pacific/Pago_Pago) through +11 (Pacific/Norfolk).
    const fmt = (tz: string) =>
      d.toLocaleDateString('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })

    expect(fmt('Pacific/Pago_Pago')).toBe('2026-04-25') // UTC-11
    expect(fmt('America/Los_Angeles')).toBe('2026-04-25') // UTC-08/-07
    expect(fmt('UTC')).toBe('2026-04-25')
    expect(fmt('Asia/Bangkok')).toBe('2026-04-25') // UTC+07
    expect(fmt('Pacific/Norfolk')).toBe('2026-04-25') // UTC+11
  })

  test('passes through full ISO datetimes unchanged', async () => {
    const { parseDateOnly } = await import('@/lib/utils')
    const d = parseDateOnly('2026-04-25T08:30:00.000Z')

    expect(d).toBeInstanceOf(Date)
    expect(d!.toISOString()).toBe('2026-04-25T08:30:00.000Z')
  })

  test('returns null for null/undefined/empty', async () => {
    const { parseDateOnly } = await import('@/lib/utils')

    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly(undefined)).toBeNull()
    expect(parseDateOnly('')).toBeNull()
  })

  test('returns Invalid Date for unparseable input (caller guards)', async () => {
    const { parseDateOnly } = await import('@/lib/utils')
    const d = parseDateOnly('not a date')

    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d!.getTime())).toBe(true)
  })
})

describe('parseStrictDateOnly', () => {
  test('keeps the 12:00 UTC anchor for a real calendar day', async () => {
    const { parseStrictDateOnly } = await import('@/lib/utils')
    expect(parseStrictDateOnly('2024-02-29')!.toISOString()).toBe('2024-02-29T12:00:00.000Z')
    expect(parseStrictDateOnly(null)).toBeNull()
  })

  test.each(['2026-02-30', '2025-02-29', '2026-04-31', '2026-13-01', '2026-02-30T08:00:00Z'])(
    '%p is refused instead of rolling over',
    async (value) => {
      const { parseStrictDateOnly } = await import('@/lib/utils')
      expect(Number.isNaN(parseStrictDateOnly(value)!.getTime())).toBe(true)
    },
  )
})

describe('todayDateOnly', () => {
  test('uses the Thai calendar day, anchored at 12:00 UTC', async () => {
    const { todayDateOnly } = await import('@/lib/utils')
    // 03:30 on 23 Sep in Bangkok is still 22 Sep in UTC.
    expect(todayDateOnly(new Date('2026-09-22T20:30:00Z')).toISOString())
      .toBe('2026-09-23T12:00:00.000Z')
    // 23:30 on 23 Sep in Bangkok.
    expect(todayDateOnly(new Date('2026-09-23T16:30:00Z')).toISOString())
      .toBe('2026-09-23T12:00:00.000Z')
  })
})

describe('parseStrictNumber', () => {
  test('takes finite numbers and plain decimal strings', async () => {
    const { parseStrictNumber } = await import('@/lib/utils')
    expect(parseStrictNumber(150)).toBe(150)
    expect(parseStrictNumber('180.25')).toBe(180.25)
    expect(parseStrictNumber(' 7 ')).toBe(7)
    expect(parseStrictNumber('-3')).toBe(-3)
  })

  test.each(['150abc', [150], true, '0x10', '', '1e3', Infinity, NaN, null, undefined])(
    'refuses %p',
    async (value) => {
      const { parseStrictNumber } = await import('@/lib/utils')
      expect(parseStrictNumber(value)).toBeNull()
    },
  )
})
