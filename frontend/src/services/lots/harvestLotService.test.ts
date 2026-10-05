import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../apiError'
import { transformHarvestLotUpdateToBackend } from '../utils/transformers'
import {
  deleteHarvestLot,
  HarvestLotProcessedError,
  updateHarvestLot,
} from './harvestLotService'

const backendLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'hl-1', displayId: 'HL-2026-12', farmId: 'farm-1', farmerName: 'Somchai',
  cherryVariety: 'Catimor', weightKg: 400, remainingWeightKg: 400,
  farmPlotLocation: 'Plot A', harvestDate: '2026-09-15T00:00:00.000Z',
  status: 'ReadyForProcessing', cropYearId: 'cy-2026',
  ...overrides,
})

describe('transformHarvestLotUpdateToBackend', () => {
  it('sends nothing for an empty edit', () => {
    expect(transformHarvestLotUpdateToBackend({})).toStrictEqual({})
  })

  it('never fills in a default for a field left out', () => {
    // The F4 wipe: { farmId } alone used to go out with farmerName '',
    // weightKg 0, status ReadyForProcessing and cropYearId null.
    expect(transformHarvestLotUpdateToBackend({ farmId: 'farm-2' })).toStrictEqual({ farmId: 'farm-2' })
    expect(transformHarvestLotUpdateToBackend({ cherryVariety: 'Typica', harvestDate: undefined }))
      .toStrictEqual({ cherryVariety: 'Typica' })
  })

  it('maps the given fields the way a create does', () => {
    expect(transformHarvestLotUpdateToBackend({
      farmerName: 'Somchai',
      cherryVariety: 'Typica',
      weightKg: 385.5,
      farmPlotLocation: 'Plot B',
      harvestDate: '2026-09-20',
      status: 'Ready for Processing',
      cropYearId: 'cy-2027',
    })).toStrictEqual({
      farmerName: 'Somchai',
      cherryVariety: 'Typica',
      weightKg: 385.5,
      farmPlotLocation: 'Plot B',
      harvestDate: '2026-09-20',
      status: 'ReadyForProcessing',
      cropYearId: 'cy-2027',
    })
    expect(transformHarvestLotUpdateToBackend({ status: 'Complete' })).toStrictEqual({ status: 'Complete' })
  })

  it('sends a blank crop year or farm as null, for the backend to judge', () => {
    expect(transformHarvestLotUpdateToBackend({ cropYearId: '  ' })).toStrictEqual({ cropYearId: null })
    expect(transformHarvestLotUpdateToBackend({ farmId: '' })).toStrictEqual({ farmId: null })
  })

  it('does not turn an unreadable weight into 0', () => {
    const payload = transformHarvestLotUpdateToBackend({ weightKg: Number('abc') })
    expect(payload.weightKg).toBeNaN()
    // NaN goes over the wire as null, which the backend refuses.
    expect(JSON.parse(JSON.stringify(payload))).toStrictEqual({ weightKg: null })
  })

  it('leaves out read-only keys such as the id, farm summary and remaining weight', () => {
    expect(transformHarvestLotUpdateToBackend({
      id: 'hl-1', displayId: 'HL-2026-12', remainingWeightKg: 0,
      farm: { id: 'farm-1', farmName: 'Doi' }, createdAt: 'x', updatedAt: 'y',
      cherryVariety: 'Typica',
    })).toStrictEqual({ cherryVariety: 'Typica' })
  })
})

describe('updateHarvestLot', () => {
  afterEach(() => vi.restoreAllMocks())

  it('puts only the given fields and maps the saved lot back', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ harvestLot: backendLot({ cherryVariety: 'Typica' }) })

    const saved = await updateHarvestLot('hl-1', { cherryVariety: 'Typica' })

    expect(put).toHaveBeenCalledWith('/harvest-lots/hl-1', { cherryVariety: 'Typica' })
    expect(saved).toMatchObject({
      id: 'hl-1', cherryVariety: 'Typica', farmId: 'farm-1', cropYearId: 'cy-2026',
      status: 'Ready for Processing', harvestDate: '2026-09-15',
    })
  })

  it("rethrows the backend's reason, e.g. a locked processed lot", async () => {
    const message = 'This lot has already been processed, so its weight and status are locked'
    vi.spyOn(api, 'put').mockRejectedValue(new ApiError(message, 409, { error: message }))
    await expect(updateHarvestLot('hl-1', { weightKg: 10 })).rejects.toThrow(message)
  })
})

describe('deleteHarvestLot', () => {
  afterEach(() => vi.restoreAllMocks())

  it('asks for the guard or the cascade only when told to', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({})
    await deleteHarvestLot('hl-1')
    await deleteHarvestLot('hl-1', { ifUnprocessed: true })
    await deleteHarvestLot('hl-1', { cascade: true })
    await deleteHarvestLot('hl-1', {
      cascade: true,
      expected: { processingBatches: 2, parchmentLots: 1, greenBeanLots: 3, withdrawals: 0 },
    })
    // The counts only go with a cascade.
    await deleteHarvestLot('hl-1', {
      expected: { processingBatches: 2, parchmentLots: 1, greenBeanLots: 3, withdrawals: 0 },
    })
    expect(del.mock.calls).toEqual([
      ['/harvest-lots/hl-1'],
      ['/harvest-lots/hl-1?ifUnprocessed=1'],
      ['/harvest-lots/hl-1?cascade=1'],
      ['/harvest-lots/hl-1?cascade=1&expect=2,1,3,0'],
      ['/harvest-lots/hl-1'],
    ])
  })

  it('throws HarvestLotProcessedError with the counts of a 409 that lists them', async () => {
    const body = {
      error: 'This lot has already been processed',
      dependents: { processingBatches: 2, parchmentLots: 1, greenBeanLots: 3, withdrawals: 4 },
    }
    vi.spyOn(api, 'delete').mockRejectedValue(new ApiError(body.error, 409, body))

    const error = await deleteHarvestLot('hl-1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HarvestLotProcessedError)
    expect(error).toBeInstanceOf(Error)
    expect((error as HarvestLotProcessedError).message).toBe('This lot has already been processed')
    expect((error as HarvestLotProcessedError).dependents).toStrictEqual({
      processingBatches: 2, parchmentLots: 1, greenBeanLots: 3, withdrawals: 4,
    })
  })

  it('counts a missing dependent as 0', async () => {
    const body = { error: 'This lot has already been processed', dependents: { processingBatches: 1 } }
    vi.spyOn(api, 'delete').mockRejectedValue(new ApiError(body.error, 409, body))
    const error = await deleteHarvestLot('hl-1').catch((e: unknown) => e)
    expect((error as HarvestLotProcessedError).dependents).toStrictEqual({
      processingBatches: 1, parchmentLots: 0, greenBeanLots: 0, withdrawals: 0,
    })
  })

  it('keeps the plain message for a guarded 409 without counts and for other errors', async () => {
    const guarded = 'This cherry lot has already been processed, so it was not deleted'
    const del = vi.spyOn(api, 'delete').mockRejectedValueOnce(new ApiError(guarded, 409, { error: guarded }))
    const first = await deleteHarvestLot('hl-1', { ifUnprocessed: true }).catch((e: unknown) => e)
    expect(first).not.toBeInstanceOf(HarvestLotProcessedError)
    expect((first as Error).message).toBe(guarded)

    del.mockRejectedValueOnce(new ApiError('Forbidden', 403, { error: 'Forbidden' }))
    await expect(deleteHarvestLot('hl-1')).rejects.toThrow("You don't have permission to delete harvest lot.")
  })

  it('passes on a cascade refused over green bean lots in use word for word', async () => {
    const message =
      'Nothing was deleted, because a green bean lot made from this lot cannot go with it. GBL-2026-404: has 1 withdrawal. ' +
      'To delete it, first void the withdrawals of GBL-2026-404, or settle its roaster stock, roasts, sales and invoices, then delete again.'
    const body = { error: message, greenBeanLotsInUse: [{ id: 'gbl-1', displayId: 'GBL-2026-404', grade: 'AA' }] }
    vi.spyOn(api, 'delete').mockRejectedValue(new ApiError(message, 409, body))

    const error = await deleteHarvestLot('hl-1', { cascade: true }).catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(HarvestLotProcessedError)
    expect((error as Error).message).toBe(message)
  })
})
