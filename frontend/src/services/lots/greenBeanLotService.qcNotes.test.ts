import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { transformGreenBeanLotFromBackend, updateGreenBeanLotScore } from './greenBeanLotService'

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// The QC Score popup's "Tasting Notes & Comments" are saved on the lot
// (GreenBeanLot.qcNotes, prisma/sql/008) with the score, and come back with it.

const backendLot = (extra: Record<string, unknown> = {}) => ({
  id: 'gbl-1', displayId: 'GBL-2026-1', sourceType: 'Internal', grade: 'Grade A',
  initialWeightKg: 50, currentWeightKg: 40, availabilityStatus: 'Available', withdrawalHistory: [],
  ...extra,
})

describe('QC notes on a green bean lot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the saved notes, and none as unset', () => {
    expect(transformGreenBeanLotFromBackend(backendLot({ qcNotes: 'Stone fruit' })).qcNotes).toBe('Stone fruit')
    expect(transformGreenBeanLotFromBackend(backendLot({ qcNotes: null })).qcNotes).toBeUndefined()
    expect(transformGreenBeanLotFromBackend(backendLot()).qcNotes).toBeUndefined()
  })

  it('sends the notes trimmed alongside the score and the attribute scores', async () => {
    vi.mocked(api.patch).mockResolvedValue({ greenBeanLot: backendLot({ processorScore: 86, qcNotes: 'Stone fruit' }) })

    const lot = await updateGreenBeanLotScore('gbl-1', 86, { cuppingFlavor: 8 }, '  Stone fruit  ')

    expect(api.patch).toHaveBeenCalledWith('/green-bean-lots/gbl-1', {
      processorScore: 86, cuppingFlavor: 8, qcNotes: 'Stone fruit',
    })
    expect(lot.qcNotes).toBe('Stone fruit')
  })

  it('sends emptied notes as null (clears them) and leaves them out when not given', async () => {
    vi.mocked(api.patch).mockResolvedValue({ greenBeanLot: backendLot() })

    await updateGreenBeanLotScore('gbl-1', 80, undefined, '   ')
    expect(api.patch).toHaveBeenLastCalledWith('/green-bean-lots/gbl-1', { processorScore: 80, qcNotes: null })

    await updateGreenBeanLotScore('gbl-1', 80)
    expect(api.patch).toHaveBeenLastCalledWith('/green-bean-lots/gbl-1', { processorScore: 80 })
  })
})
