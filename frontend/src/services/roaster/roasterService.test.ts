import { describe, expect, it } from 'vitest'
import { transformInventoryItem } from './roasterService'

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
