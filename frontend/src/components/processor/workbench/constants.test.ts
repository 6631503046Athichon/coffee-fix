import type { HarvestLot } from '../../../types'
import { getHarvestLotCherryWeight, getReadyHarvestLots } from './constants'

describe('getHarvestLotCherryWeight', () => {
  it('always shows the original cherry weight, never the old partial balance', () => {
    expect(getHarvestLotCherryWeight({ weightKg: 400, remainingWeightKg: 200 })).toBe(400)
    expect(getHarvestLotCherryWeight({ weightKg: 3563, remainingWeightKg: 2413 })).toBe(3563)
    expect(getHarvestLotCherryWeight({ weightKg: 100, remainingWeightKg: 0 })).toBe(100)
  })

  it('falls back to weightKg when remainingWeightKg is undefined or null', () => {
    expect(getHarvestLotCherryWeight({ weightKg: 100 })).toBe(100)
    expect(
      getHarvestLotCherryWeight({ weightKg: 100, remainingWeightKg: null as unknown as undefined }),
    ).toBe(100)
  })

  it('clamps invalid original weights but ignores negative legacy balances', () => {
    expect(getHarvestLotCherryWeight({ weightKg: -1 })).toBe(0)
    expect(getHarvestLotCherryWeight({ weightKg: 10, remainingWeightKg: -1e-9 })).toBe(10)
  })

  it('returns 0 for non-finite or missing weights', () => {
    expect(getHarvestLotCherryWeight({ weightKg: Number.NaN })).toBe(0)
    expect(getHarvestLotCherryWeight({ weightKg: undefined as unknown as number })).toBe(0)
  })
})

describe('whole-lot availability', () => {
  const lot: HarvestLot = {
    id: 'hl-f442', farmerName: 'Farmer', cherryVariety: 'Catimor',
    farmPlotLocation: '', harvestDate: '2026-09-15',
    weightKg: 400, remainingWeightKg: 200, status: 'Ready for Processing',
  }

  it('hides legacy processed lots even if their stored status is still Ready', () => {
    expect(getReadyHarvestLots([lot], [{ harvestLotId: lot.id }])).toEqual([])
  })

  it('keeps an unprocessed lot and hides Complete lots without loaded batch history', () => {
    expect(getReadyHarvestLots([lot], [])).toEqual([lot])
    expect(getReadyHarvestLots([{ ...lot, status: 'Complete' }], [])).toEqual([])
  })
})
