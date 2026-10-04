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

  // On someone else's lot the backend withholds the purpose with the sale.
  it('maps a withdrawal sent without its purpose and keeps the hidden flag', () => {
    const lot = transformGreenBeanLotFromBackend(backendLot({
      withdrawalHistory: [{
        id: 'gw-1', amountKg: 5, withdrawalType: 'RoastingStock', date: '2026-09-20T00:00:00.000Z',
        withdrawnByName: 'Proc Two', saleDetailsHidden: true,
      }],
    }))
    const [row] = lot.withdrawalHistory!
    expect(row).toMatchObject({
      amountKg: 5, withdrawalType: 'Roasting Stock', date: '2026-09-20', saleDetailsHidden: true,
    })
    expect(row.purpose).toBeUndefined()
  })

  // 02:30 on 5 Oct in Thailand is still 4 Oct in UTC: the row is the 5th.
  it('dates a withdrawal and a price by their Thai day', () => {
    const lot = transformGreenBeanLotFromBackend(backendLot({
      priceSetDate: '2026-10-04T19:30:00.000Z',
      withdrawalHistory: [{
        id: 'gw-2', amountKg: 2, withdrawalType: 'Sale', date: '2026-10-04T19:30:00.000Z',
      }],
    }))
    expect(lot.withdrawalHistory![0].date).toBe('2026-10-05')
    expect(lot.priceSetDate).toBe('2026-10-05')
    expect(transformGreenBeanLotFromBackend(backendLot({ priceSetDate: null })).priceSetDate).toBeUndefined()
  })
})
