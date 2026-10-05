import { describe, expect, it } from 'vitest'
import { GreenBeanSourceType, ParchmentSourceType } from '../../../types'
import type { GreenBeanLot, HarvestLot, ParchmentLot } from '../../../types'
import {
  greenBeanSearchFields,
  harvestLotSearchFields,
  matchesLotSearch,
  parchmentSearchFields,
} from './lotSearch'

const cherry: HarvestLot = {
  id: 'hl-1', displayId: 'HL-2026-1', weightKg: 400, status: 'Complete',
  farmerName: 'Somchai Doi', cherryVariety: 'Typica', farmPlotLocation: 'Plot 3',
  harvestDate: '2026-09-15', farm: { id: 'f-1', farmName: 'Doi Farm' },
}
const parchment: ParchmentLot = {
  id: 'pl-1', displayId: 'PCH-2026-1', processingBatchId: 'pb-1', harvestLotId: 'hl-1',
  sourceType: ParchmentSourceType.Internal, initialWeightKg: 100, currentWeightKg: 60,
  moistureContent: 11, processType: 'Honey', status: 'AwaitingHulling',
}
const green: GreenBeanLot = {
  id: 'gbl-1', displayId: 'GBL-2026-5', sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'pl-1',
  grade: 'Grade A', initialWeightKg: 40, currentWeightKg: 40, availabilityStatus: 'Available',
  cuppingScores: [],
}

describe('matchesLotSearch', () => {
  it('matches part of any field, in any case, and everything for an empty search', () => {
    expect(matchesLotSearch('doi', ['GBL-1', 'Somchai Doi'])).toBe(true)
    expect(matchesLotSearch('  DOI ', ['somchai doi'])).toBe(true)
    expect(matchesLotSearch('geisha', ['Typica', undefined, null])).toBe(false)
    expect(matchesLotSearch('', [])).toBe(true)
  })
})

describe('what each Workbench search box matches', () => {
  const find = (query: string, fields: (string | null | undefined)[]) => matchesLotSearch(query, fields)

  it('finds a cherry lot by id, farmer, farm, variety and plot', () => {
    const fields = harvestLotSearchFields(cherry)
    for (const q of ['hl-2026-1', 'somchai', 'doi farm', 'typica', 'plot 3']) expect(find(q, fields)).toBe(true)
  })

  it('finds a parchment lot by id, source lot, farmer, variety, process and status', () => {
    const fields = parchmentSearchFields(parchment, cherry, undefined)
    for (const q of ['pch-2026-1', 'hl-2026-1', 'somchai', 'typica', 'honey', 'awaiting hulling']) {
      expect(find(q, fields)).toBe(true)
    }
    expect(find('geisha', fields)).toBe(false)
  })

  it('finds a green bean lot by id, source lots, farmer, variety, process and grade', () => {
    const fields = greenBeanSearchFields(green, parchment, cherry)
    for (const q of ['gbl-2026-5', 'pch-2026-1', 'hl-2026-1', 'somchai', 'typica', 'honey', 'grade a']) {
      expect(find(q, fields)).toBe(true)
    }
    expect(find('natural', fields)).toBe(false)
  })

  it("finds a bought-in green bean lot by its producer, variety and process", () => {
    const external: GreenBeanLot = {
      ...green, parchmentLotId: undefined, sourceType: GreenBeanSourceType.External,
      externalSource: {
        originName: 'Doi Chang Co-op', producerName: 'Aree', variety: 'Catimor', processType: 'Washed',
        purchaseDate: '2026-07-30', pricePerKg: 300, currency: 'THB',
      },
    }
    const fields = greenBeanSearchFields(external, undefined, undefined)
    for (const q of ['aree', 'catimor', 'washed', 'external']) expect(find(q, fields)).toBe(true)
  })
})
