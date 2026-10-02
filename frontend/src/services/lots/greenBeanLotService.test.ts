import { describe, expect, it } from 'vitest'
import { transformGreenBeanLotFromBackend } from './greenBeanLotService'

// A green-bean lot as bulk-load phase 2 sends it.
const backendLot = (extra: Record<string, unknown> = {}) => ({
  id: 'gbl-1',
  displayId: 'GBL-2026-12',
  sourceType: 'Internal',
  parchmentLotId: 'pl-1',
  grade: 'Grade A',
  initialWeightKg: 60,
  currentWeightKg: 60,
  availabilityStatus: 'Available',
  withdrawalHistory: [],
  createdAt: '2026-09-27T03:00:00.000Z',
  ...extra,
})

describe('transformGreenBeanLotFromBackend', () => {
  // F12: who may withdraw from or price the lot.
  it('keeps the creator', () => {
    expect(transformGreenBeanLotFromBackend(backendLot({ createdById: 'p-1' })).createdById).toBe('p-1')
    expect(transformGreenBeanLotFromBackend(backendLot({ createdById: null })).createdById).toBeUndefined()
  })

  // F13: the Parchment page groups a lot by its parchment lot's process
  // type, which the parchment list may not hold.
  it('takes the process type of the nested parchment lot', () => {
    const lot = transformGreenBeanLotFromBackend(backendLot({
      parchmentLot: { processType: 'Natural', processingBatch: { processType: 'Washed' } },
    }))
    expect(lot.parchmentProcessType).toBe('Natural')
  })

  it('falls back to the parchment lot\'s batch process type', () => {
    const lot = transformGreenBeanLotFromBackend(backendLot({
      parchmentLot: { processType: null, processingBatch: { processType: 'Honey' } },
    }))
    expect(lot.parchmentProcessType).toBe('Honey')
  })

  it('leaves it unset for a lot with no parchment lot', () => {
    const lot = transformGreenBeanLotFromBackend(backendLot({ parchmentLotId: null, parchmentLot: null }))
    expect(lot.parchmentProcessType).toBeUndefined()
    expect(transformGreenBeanLotFromBackend(backendLot()).parchmentProcessType).toBeUndefined()
  })
})
