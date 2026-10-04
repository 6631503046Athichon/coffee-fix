/**
 * F35: "today" and "this year" are Thai time (UTC+7), not the server's UTC.
 *
 * - displayIds (HL-2027-1) take the Thai year, so lots made on 1 January
 *   before 07:00 are not numbered with last year
 * - pastDateSchema (the harvest date on a new harvest lot) accepts the Thai
 *   "today" before 07:00, and futureDateSchema no longer takes the Thai
 *   yesterday as today
 *
 * Railway and Vercel run on UTC. This machine may not, and a test cannot
 * switch the process time zone (jest sandboxes process.env), so onUtcServer()
 * points the local-time Date methods the old code used at their UTC versions,
 * which is what they do on a UTC server. Only Date is faked by at().
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'

const NativeDatePrototype = Date.prototype

function onUtcServer() {
  jest.spyOn(NativeDatePrototype, 'getFullYear').mockImplementation(function (this: Date) {
    return this.getUTCFullYear()
  })
  jest.spyOn(NativeDatePrototype, 'setHours').mockImplementation(function (
    this: Date,
    hours: number,
    minutes?: number,
    seconds?: number,
    ms?: number,
  ) {
    return this.setUTCHours(
      hours,
      minutes ?? this.getUTCMinutes(),
      seconds ?? this.getUTCSeconds(),
      ms ?? this.getUTCMilliseconds(),
    )
  })
}

/** Pins the clock (Date only; timers and promises run as usual). */
function at(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
}

beforeEach(() => {
  onUtcServer()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

const emptyModel = () => ({ findMany: jest.fn(async (_args: any) => [] as any[]) })

describe('displayId year (lib/utils)', () => {
  test('a lot made at 00:30 on 1 January in Thailand (17:30 UTC on 31 December) gets the new year', async () => {
    at('2026-12-31T17:30:00.000Z')
    const { nextDisplayId } = await import('@/lib/utils')
    const model = emptyModel()

    expect(await nextDisplayId(model, 'HL')).toBe('HL-2027-1')
    // It counts on from this year's numbers, not last year's.
    expect(model.findMany.mock.calls[0][0].where.displayId).toEqual({ startsWith: 'HL-2027-' })
  })

  test('nextDisplayIds takes the Thai year too', async () => {
    at('2026-12-31T17:30:00.000Z')
    const { nextDisplayIds } = await import('@/lib/utils')
    const model = emptyModel()

    expect(await nextDisplayIds(model, 'GB', 2)).toEqual(['GB-2027-1', 'GB-2027-2'])
    expect(model.findMany.mock.calls[0][0].where.displayId).toEqual({ startsWith: 'GB-2027-' })
  })

  test('the year does not turn early: 23:59 on 31 December in Thailand is still the old year', async () => {
    at('2026-12-31T16:59:00.000Z')
    const { nextDisplayId } = await import('@/lib/utils')
    expect(await nextDisplayId(emptyModel(), 'HL')).toBe('HL-2026-1')
  })

  test('businessYear turns at midnight Thai time', async () => {
    const { businessYear } = await import('@/lib/utils')
    expect(businessYear(new Date('2026-12-31T16:59:59.999Z'))).toBe(2026)
    expect(businessYear(new Date('2026-12-31T17:00:00.000Z'))).toBe(2027)
  })
})

describe('pastDateSchema: a harvest date may be today in Thailand, not later', () => {
  // 03:00 on 4 October in Thailand, still 3 October on a UTC server.
  const EARLY_MORNING = '2026-10-03T20:00:00.000Z'

  test("at 03:00 Thai time, today's date (4 Oct) is accepted", async () => {
    at(EARLY_MORNING)
    const { pastDateSchema } = await import('@/lib/validations/common')
    expect(pastDateSchema.safeParse('2026-10-04').success).toBe(true)
  })

  test('at 03:00 Thai time, yesterday is accepted and tomorrow is refused', async () => {
    at(EARLY_MORNING)
    const { pastDateSchema } = await import('@/lib/validations/common')
    expect(pastDateSchema.safeParse('2026-10-03').success).toBe(true)
    const tomorrow = pastDateSchema.safeParse('2026-10-05')
    expect(tomorrow.success).toBe(false)
    expect(tomorrow.error?.issues[0]?.message).toBe('วันที่ต้องไม่เกินวันนี้')
  })

  test('a full datetime counts as its Thai day', async () => {
    at(EARLY_MORNING)
    const { pastDateSchema } = await import('@/lib/validations/common')
    // Midnight starting 4 October in Thailand: today.
    expect(pastDateSchema.safeParse('2026-10-03T17:00:00.000Z').success).toBe(true)
    // Midnight starting 5 October in Thailand: tomorrow.
    expect(pastDateSchema.safeParse('2026-10-04T17:00:00.000Z').success).toBe(false)
  })

  test('late evening Thai time: today is accepted, tomorrow is not', async () => {
    at('2026-10-04T16:30:00.000Z') // 23:30 on 4 October in Thailand
    const { pastDateSchema } = await import('@/lib/validations/common')
    expect(pastDateSchema.safeParse('2026-10-04').success).toBe(true)
    expect(pastDateSchema.safeParse('2026-10-05').success).toBe(false)
  })

  test('text that is not a date is refused', async () => {
    at(EARLY_MORNING)
    const { pastDateSchema } = await import('@/lib/validations/common')
    expect(pastDateSchema.safeParse('not a date').success).toBe(false)
    expect(pastDateSchema.safeParse('').success).toBe(false)
  })

  test('a new harvest lot dated today is accepted at 03:00 Thai time', async () => {
    at(EARLY_MORNING)
    const { createHarvestLotSchema } = await import('@/lib/validations/harvestLot')
    const parsed = createHarvestLotSchema.safeParse({
      farmerName: 'Somchai',
      cherryVariety: 'Typica',
      weightKg: 120,
      farmPlotLocation: 'Plot 1',
      harvestDate: '2026-10-04',
    })
    expect(parsed.success).toBe(true)
  })
})

describe('futureDateSchema: today or later in Thailand', () => {
  test('at 03:00 Thai time, yesterday (3 Oct) is refused and today (4 Oct) is accepted', async () => {
    at('2026-10-03T20:00:00.000Z')
    const { futureDateSchema } = await import('@/lib/validations/common')
    expect(futureDateSchema.safeParse('2026-10-03').success).toBe(false)
    expect(futureDateSchema.safeParse('2026-10-04').success).toBe(true)
    expect(futureDateSchema.safeParse('2026-10-05').success).toBe(true)
  })
})
