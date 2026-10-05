import type { CropYear, HarvestLot } from '../../../types'
import { findCurrentCropYearId, getHarvestLotCherryWeight, getReadyHarvestLots, selectableCropYears } from './constants'

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

describe('findCurrentCropYearId', () => {
  // As bulk-load sends them: 1 October to 30 September, midnight UTC.
  const year = (start: number, bounds: Partial<CropYear> = {}): CropYear => ({
    id: `cy-${start}`,
    year: `${start}/${start + 1}`,
    startDate: `${start}-10-01T00:00:00.000Z`,
    endDate: `${start + 1}-09-30T00:00:00.000Z`,
    ...bounds,
  })
  const years = [year(2027), year(2026), year(2025)]

  it('keeps 2026/2027 current through all of 30 September in Bangkok', () => {
    // 10:00 on 30 September in Bangkok, after the end bound's instant.
    expect(findCurrentCropYearId(years, new Date('2027-09-30T03:00:00.000Z'))).toBe('cy-2026')
    // 23:59 on 30 September in Bangkok.
    expect(findCurrentCropYearId(years, new Date('2027-09-30T16:59:00.000Z'))).toBe('cy-2026')
  })

  it('makes 2027/2028 current from 00:00 on 1 October in Bangkok', () => {
    // 00:30 on 1 October in Bangkok, before the start bound's instant.
    expect(findCurrentCropYearId(years, new Date('2027-09-30T17:30:00.000Z'))).toBe('cy-2027')
  })

  it('reads bounds an Admin saved at 12:00 UTC as the same days', () => {
    const edited = [year(2026, { startDate: '2026-10-01T12:00:00.000Z', endDate: '2027-10-15T12:00:00.000Z' })]
    expect(findCurrentCropYearId(edited, new Date('2026-09-30T18:00:00.000Z'))).toBe('cy-2026')
    expect(findCurrentCropYearId(edited, new Date('2027-10-15T16:00:00.000Z'))).toBe('cy-2026')
    expect(findCurrentCropYearId(edited, new Date('2027-10-15T17:00:00.000Z'))).toBe('')
  })

  it('gives an empty string when no year covers today', () => {
    expect(findCurrentCropYearId([year(2025)], new Date('2027-06-15T05:00:00.000Z'))).toBe('')
    expect(findCurrentCropYearId([], new Date('2027-06-15T05:00:00.000Z'))).toBe('')
  })
})

describe('selectableCropYears', () => {
  const year = (start: number): CropYear => ({
    id: `cy-${start}`,
    year: `${start}/${start + 1}`,
    startDate: `${start}-10-01T00:00:00.000Z`,
    endDate: `${start + 1}-09-30T00:00:00.000Z`,
  })
  const years = [year(2024), year(2026), year(2025), year(2027), year(2028)]
  const ids = (list: CropYear[]) => list.map((y) => y.id)
  // 5 October 2026 in Bangkok: the 2026/2027 season.
  const now = new Date('2026-10-05T03:00:00.000Z')

  it('offers the current season and the one either side, newest first', () => {
    expect(ids(selectableCropYears(years, '', now))).toEqual(['cy-2027', 'cy-2026', 'cy-2025'])
  })

  it('turns the season over on 1 October in Bangkok', () => {
    // 23:30 on 30 September in Bangkok is still 2025/2026.
    expect(ids(selectableCropYears(years, '', new Date('2026-09-30T16:30:00.000Z'))))
      .toEqual(['cy-2026', 'cy-2025', 'cy-2024'])
    // 00:30 on 1 October in Bangkok is 2026/2027.
    expect(ids(selectableCropYears(years, '', new Date('2026-09-30T17:30:00.000Z'))))
      .toEqual(['cy-2027', 'cy-2026', 'cy-2025'])
  })

  it("keeps a lot's own older year picked", () => {
    expect(ids(selectableCropYears(years, 'cy-2024', now))).toEqual(['cy-2027', 'cy-2026', 'cy-2025', 'cy-2024'])
  })

  it("keeps the lot's own year as a choice after another year is picked", () => {
    // The lot is filed under 2024/2025 and 2026/2027 is now picked: both stay.
    expect(ids(selectableCropYears(years, ['cy-2024', 'cy-2026'], now)))
      .toEqual(['cy-2027', 'cy-2026', 'cy-2025', 'cy-2024'])
    // A lot with no year of its own, or a cleared pick, adds nothing.
    expect(ids(selectableCropYears(years, [undefined, ''], now))).toEqual(['cy-2027', 'cy-2026', 'cy-2025'])
    expect(ids(selectableCropYears(years, null, now))).toEqual(['cy-2027', 'cy-2026', 'cy-2025'])
  })

  it('offers every year rather than none when no label is in the window', () => {
    const odd = [{ ...year(2026), year: 'Season 26' }, { ...year(2025), year: 'Season 25' }]
    expect(ids(selectableCropYears(odd, '', now))).toEqual(['cy-2026', 'cy-2025'])
  })
})
