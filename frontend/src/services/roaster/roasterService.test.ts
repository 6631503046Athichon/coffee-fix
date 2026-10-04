import { afterEach, describe, expect, it, vi } from 'vitest'
import { transformInventoryItem, transformRoastBatch } from './roasterService'

// The roaster's stock row names how it got the lot from the lot's latest
// withdrawal. A voided withdrawal (D7) never happened, so it is skipped.

const item = (withdrawalHistory: unknown[]) => ({
  id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 10, remainingWeightKg: 10,
  greenBeanLot: { displayId: 'GBL-1', grade: 'Grade A', withdrawalHistory },
})

describe('transformInventoryItem', () => {
  it('takes the type of the latest withdrawal that is not void', () => {
    expect(transformInventoryItem(item([
      { withdrawalType: 'Sample', voidedAt: '2026-10-04T00:00:00.000Z' },
      { withdrawalType: 'RoastingStock', voidedAt: null },
    ])).withdrawalType).toBe('RoastingStock')
  })

  it('keeps when the stock row was started, so a void can tell whether it held an older push', () => {
    expect(transformInventoryItem({ ...item([]), createdAt: '2026-09-01T03:00:00.000Z' }).createdAt)
      .toBe('2026-09-01T03:00:00.000Z')
  })

  it('has no type when every withdrawal is void, or there are none', () => {
    expect(transformInventoryItem(item([{ withdrawalType: 'Sample', voidedAt: '2026-10-04' }])).withdrawalType).toBeUndefined()
    expect(transformInventoryItem(item([])).withdrawalType).toBeUndefined()
  })
})

describe('transformRoastBatch roastDate', () => {
  const originalTZ = process.env.TZ
  afterEach(() => {
    vi.useRealTimers()
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  const batch = (roastDate?: string) => ({
    id: 'rb-1', roasterId: 'r-1', roasterInventoryId: 'inv-1', greenBeanLotId: 'gbl-1',
    batchSizeKg: 5, yieldPercentage: 84, roastDate,
  })

  // 02:30 on 5 Oct in Thailand is still 4 Oct in UTC.
  it('is the Thai day of the roast', () => {
    expect(transformRoastBatch(batch('2026-10-04T19:30:00.000Z')).roastDate).toBe('2026-10-05')
    expect(transformRoastBatch(batch('2026-10-05T12:00:00.000Z')).roastDate).toBe('2026-10-05')
  })

  it("falls back to the viewer's today, not the UTC day", () => {
    process.env.TZ = 'Asia/Bangkok'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T19:30:00.000Z'))
    expect(transformRoastBatch(batch()).roastDate).toBe('2026-10-05')
  })
})
