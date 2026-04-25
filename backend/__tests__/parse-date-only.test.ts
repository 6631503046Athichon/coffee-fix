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
