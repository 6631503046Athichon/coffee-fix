import { harvestLotStatusFilter, serializeHarvestLot } from '@/lib/harvestLot'

describe('whole-lot harvest state', () => {
  const lot = {
    id: 'hl-f442', weightKg: 400, remainingWeightKg: 200,
    status: 'ReadyForProcessing' as const,
    _count: { processingBatches: 1 },
  }

  test('considers an old partial lot consumed while preserving its original input and history', () => {
    expect(serializeHarvestLot(lot)).toEqual({
      id: 'hl-f442', weightKg: 400, remainingWeightKg: 0, status: 'Complete',
    })
    expect(lot.remainingWeightKg).toBe(200)
    expect(lot.status).toBe('ReadyForProcessing')
  })

  test('restores the full input for a Ready lot with no batches', () => {
    expect(serializeHarvestLot({ ...lot, _count: { processingBatches: 0 } }))
      .toMatchObject({ status: 'ReadyForProcessing', weightKg: 400, remainingWeightKg: 400 })
  })

  test('does not reopen a completed lot when it has no batch record', () => {
    expect(serializeHarvestLot({ ...lot, status: 'Complete', _count: { processingBatches: 0 } }))
      .toMatchObject({ status: 'Complete', remainingWeightKg: 0 })
  })

  test('filters before pagination using the same consumption rule', () => {
    expect(harvestLotStatusFilter('ReadyForProcessing')).toEqual({
      status: 'ReadyForProcessing', processingBatches: { none: {} },
    })
    expect(harvestLotStatusFilter('Complete')).toEqual({
      OR: [{ status: 'Complete' }, { processingBatches: { some: {} } }],
    })
  })
})
