import { describe, expect, it } from 'vitest'
import { INITIAL_APP_DATA } from '../../../constants'
import { GreenBeanSourceType, ParchmentSourceType } from '../../../types'
import type { AppData, GreenBeanLot, RoasterInventoryItem } from '../../../types'
import { applyGreenBeanWithdrawal, enrichRoasterInventoryItem } from './roasterStockSync'

const lot: GreenBeanLot = {
  id: 'gbl-1', displayId: 'GBL-2026-6', sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'pl-1',
  grade: 'Grade AA', processorScore: 87, initialWeightKg: 50, currentWeightKg: 40,
  availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
}

const data = (roasterInventory: RoasterInventoryItem[] = [], greenBeanLots = [lot]): AppData => ({
  ...INITIAL_APP_DATA,
  harvestLots: [{
    id: 'hl-1', displayId: 'HL-2026-1', weightKg: 400, status: 'Complete', farmerName: 'Somchai',
    cherryVariety: 'Geisha', farmPlotLocation: '', harvestDate: '2026-09-15',
  }],
  parchmentLots: [{
    id: 'pl-1', displayId: 'PCH-2026-5', sourceType: ParchmentSourceType.Internal, harvestLotId: 'hl-1',
    initialWeightKg: 100, currentWeightKg: 0, moistureContent: 11, processType: 'Honey', status: 'Hulled',
  }],
  greenBeanLots,
  roasterInventory,
})

// What POST /green-bean-lots/:id/withdrawals answers: the bare row.
const bare: RoasterInventoryItem = {
  id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 5, remainingWeightKg: 5,
}

describe('enrichRoasterInventoryItem', () => {
  it('fills what the roaster card reads from the lot, its parchment and cherry lot', () => {
    expect(enrichRoasterInventoryItem(data(), bare, 'Roasting Stock')).toEqual({
      ...bare,
      createdAt: undefined,
      greenBeanDisplayId: 'GBL-2026-6',
      grade: 'Grade AA',
      processorScore: 87,
      variety: 'Geisha',
      process: 'Honey',
      withdrawalType: 'RoastingStock',
    })
  })

  it('keeps what the stored row knew when the lot is not loaded', () => {
    const storedRow: RoasterInventoryItem = {
      ...bare, claimedWeightKg: 2, remainingWeightKg: 1, createdAt: '2026-09-30T03:00:00.000Z',
      greenBeanDisplayId: 'GBL-2026-6', grade: 'Grade AA', variety: 'Geisha', process: 'Honey',
      withdrawalType: 'RoastingStock',
    }
    expect(enrichRoasterInventoryItem(data([storedRow], []), bare)).toEqual({
      ...storedRow, claimedWeightKg: 5, remainingWeightKg: 5,
    })
  })
})

describe('applyGreenBeanWithdrawal', () => {
  const saved: GreenBeanLot = {
    ...lot, grade: '', currentWeightKg: 35,
    withdrawalHistory: [{ amountKg: 5, withdrawalType: 'Roasting Stock', purpose: 'Roasting Stock', date: '2026-10-05' }],
  }

  it('merges the lot\'s kg and history only, and adds the enriched stock row', () => {
    const next = applyGreenBeanWithdrawal(data(), saved, bare, 'Roasting Stock')
    expect(next.greenBeanLots[0]).toMatchObject({ grade: 'Grade AA', currentWeightKg: 35 })
    expect(next.greenBeanLots[0].withdrawalHistory).toHaveLength(1)
    expect(next.roasterInventory).toEqual([expect.objectContaining({ id: 'inv-1', grade: 'Grade AA' })])
  })

  it('updates the existing row in place', () => {
    const existing = { ...bare, claimedWeightKg: 3, remainingWeightKg: 3, grade: 'Grade AA' }
    const other = { ...bare, id: 'inv-2', greenBeanLotId: 'gbl-9' }
    const next = applyGreenBeanWithdrawal(data([existing, other]), saved, { ...bare, claimedWeightKg: 8, remainingWeightKg: 8 })
    expect(next.roasterInventory).toHaveLength(2)
    expect(next.roasterInventory[0]).toMatchObject({ id: 'inv-1', remainingWeightKg: 8, grade: 'Grade AA' })
    expect(next.roasterInventory[1]).toBe(other)
  })

  it('leaves the roaster stock alone without a row', () => {
    const prev = data([bare])
    expect(applyGreenBeanWithdrawal(prev, saved, undefined).roasterInventory).toBe(prev.roasterInventory)
  })
})
