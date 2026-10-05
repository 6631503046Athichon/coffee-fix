import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ProcessingBatchStatus } from '../../types'
import {
  BATCH_NOT_GRADED_MESSAGE,
  deleteProcessingBatch,
  processAndGradeBatch,
  transformProcessingBatchFromBackend,
  updateProcessingBatch,
} from './processingBatchService'

// F24: the batch edit popup saves through updateProcessingBatch. A partial
// edit must send only what changed: sending every field (as before) cleared
// the notes and drying dates whenever the popup left them out.

const batchJson = {
  id: 'pb-1',
  displayId: 'PB-2026-3',
  harvestLotId: 'hl-1',
  createdById: 'processor-1',
  status: 'Completed',
  processType: 'Natural',
  processNotes: 'Ferment 24h',
  parchmentWeightKg: 90,
  moistureContent: 11,
  dryingStartDate: '2026-09-01T12:00:00.000Z',
  dryingEndDate: '2026-09-20T12:00:00.000Z',
  baggingDate: '2026-09-20T12:00:00.000Z',
  dryingLogs: [],
  parchmentLots: [{
    id: 'pl-1', processingBatchId: 'pb-1', sourceType: 'Internal', initialWeightKg: 90,
    currentWeightKg: 50, moistureContent: 11, processType: 'Natural', status: 'AwaitingHulling',
  }],
}

describe('updateProcessingBatch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends only the fields given and maps the batch and its re-weighed parchment back', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ processingBatch: batchJson })

    const result = await updateProcessingBatch('pb-1', { processType: 'Natural', parchmentWeightKg: 90 })

    expect(put).toHaveBeenCalledWith('/processing-batches/pb-1', { processType: 'Natural', parchmentWeightKg: 90 })
    expect(result.processingBatch).toMatchObject({
      id: 'pb-1', createdById: 'processor-1', processType: 'Natural', parchmentWeightKg: 90,
      processNotes: 'Ferment 24h', dryingStartDate: '2026-09-01', dryingEndDate: '2026-09-20',
    })
    expect(result.parchmentLots).toEqual([expect.objectContaining({
      id: 'pl-1', initialWeightKg: 90, currentWeightKg: 50, processType: 'Natural',
    })])
  })

  it('maps the status to the backend value and clears notes and dates sent empty', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ processingBatch: { ...batchJson, parchmentLots: undefined } })

    const result = await updateProcessingBatch('pb-1', {
      status: ProcessingBatchStatus.ToProcess, processNotes: '', dryingEndDate: '', cropYearId: '',
    })

    expect(put).toHaveBeenCalledWith('/processing-batches/pb-1', {
      status: 'ToProcess', processNotes: null, dryingEndDate: null, cropYearId: null,
    })
    expect(result.parchmentLots).toEqual([])
  })
})

describe('transformProcessingBatchFromBackend dates', () => {
  // 02:30 on 5 Oct in Thailand is still 4 Oct in UTC: each date is the 5th.
  it('are Thai days', () => {
    const batch = transformProcessingBatchFromBackend({
      ...batchJson,
      dryingStartDate: '2026-10-04T19:30:00.000Z',
      dryingEndDate: '2026-10-05T12:00:00.000Z',
      baggingDate: null,
      dryingLogs: [
        { date: '2026-10-04T19:30:00.000Z', moistureContent: 12, ambientTemp: 28, relativeHumidity: 70 },
        { date: new Date('2026-10-04T19:30:00.000Z'), moistureContent: 11, ambientTemp: 27, relativeHumidity: 65 },
      ],
    })
    expect(batch.dryingStartDate).toBe('2026-10-05')
    expect(batch.dryingEndDate).toBe('2026-10-05')
    expect(batch.baggingDate).toBeUndefined()
    expect(batch.dryingLog?.map((log) => log.date)).toEqual(['2026-10-05', '2026-10-05'])
  })
})

describe('deleteProcessingBatch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports whether the cherry lot was handed back and how much parchment went with it', async () => {
    vi.spyOn(api, 'delete').mockResolvedValue({
      message: 'Processing batch deleted successfully', harvestLotReleased: true, parchmentLotsDeleted: 1,
    })
    await expect(deleteProcessingBatch('pb-1')).resolves.toEqual({ harvestLotReleased: true, parchmentLotsDeleted: 1 })
  })
})

describe('processAndGradeBatch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the Completed batch with its grades in one call and maps all three results back', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      processingBatch: { ...batchJson, parchmentLots: [] },
      parchmentLot: { ...batchJson.parchmentLots[0], currentWeightKg: 0, status: 'Hulled', withdrawalHistory: [] },
      greenBeanLots: [{
        id: 'gbl-1', displayId: 'GBL-2026-4', sourceType: 'Internal', parchmentLotId: 'pl-1', grade: 'Grade A',
        initialWeightKg: 60, currentWeightKg: 60, availabilityStatus: 'Available', pricePerKg: 220, currency: 'THB',
      }],
      message: 'Processing batch created and graded successfully',
    })

    const result = await processAndGradeBatch(
      { harvestLotId: 'hl-1', processType: 'Natural', parchmentWeightKg: 90, moistureContent: 11 },
      { totalGreenBeanWeight: 60, gradedLots: [{ grade: 'Grade A', weight: 60, price: 220 }] },
    )

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/processing-batches', expect.objectContaining({
      harvestLotId: 'hl-1',
      status: 'Completed',
      processType: 'Natural',
      parchmentWeightKg: 90,
      moistureContent: 11,
      hullAndGrade: { totalGreenBeanWeight: 60, gradedLots: [{ grade: 'Grade A', weight: 60, price: 220 }] },
    }))
    expect(result.processingBatch).toMatchObject({ id: 'pb-1', status: ProcessingBatchStatus.Completed })
    expect(result.parchmentLot).toMatchObject({ id: 'pl-1', currentWeightKg: 0, status: 'Hulled' })
    expect(result.greenBeanLots).toEqual([
      expect.objectContaining({ id: 'gbl-1', grade: 'Grade A', pricePerKg: 220, currentWeightKg: 60 }),
    ])
  })

  it.each([
    ['no parchment lot', { greenBeanLots: [] }],
    ['no green bean lots', { parchmentLot: { ...batchJson.parchmentLots[0] } }],
    ['green bean lots that are not a list', { parchmentLot: { ...batchJson.parchmentLots[0] }, greenBeanLots: null }],
  ])('says the batch was saved but not graded when the answer has %s', async (_case, extra) => {
    vi.spyOn(api, 'post').mockResolvedValue({
      processingBatch: { ...batchJson, parchmentLots: [] },
      message: 'Processing batch created successfully',
      ...extra,
    })

    await expect(processAndGradeBatch(
      { harvestLotId: 'hl-1', processType: 'Natural', parchmentWeightKg: 90, moistureContent: 11 },
      { totalGreenBeanWeight: 60, gradedLots: [{ grade: 'Grade A', weight: 60 }] },
    )).rejects.toThrow(BATCH_NOT_GRADED_MESSAGE)
    expect(BATCH_NOT_GRADED_MESSAGE).toBe('The batch was saved but not graded. Grade it from Parchment Stock.')
  })
})
