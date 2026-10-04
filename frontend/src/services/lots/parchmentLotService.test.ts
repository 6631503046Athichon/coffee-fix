import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { createParchmentWithdrawal, transformParchmentLotFromBackend } from './parchmentLotService'

const parchmentJson = {
  id: 'pl-1',
  displayId: 'PL-2026-3',
  sourceType: 'Internal',
  initialWeightKg: 100,
  currentWeightKg: 0,
  moistureContent: 11,
  processType: 'Washed',
  status: 'Hulled',
  withdrawalHistory: [],
  createdAt: '2026-09-27T03:00:00.000Z',
}

describe('createParchmentWithdrawal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts the graded lots with their prices and maps the created lots back', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      parchmentLot: parchmentJson,
      greenBeanLots: [
        {
          id: 'gbl-1',
          displayId: 'GBL-2026-40',
          sourceType: 'Internal',
          parchmentLotId: 'pl-1',
          grade: 'Grade A',
          initialWeightKg: 60,
          currentWeightKg: 60,
          availabilityStatus: 'Available',
          pricePerKg: 220.5,
          currency: 'THB',
          priceSetDate: '2026-09-27T12:00:00.000Z',
          priceSetBy: 'processor-1',
          createdAt: '2026-09-27T03:00:00.000Z',
        },
      ],
      message: 'Withdrawal created successfully',
    })
    const input = {
      amountKg: 100,
      withdrawalType: 'HullAndGrade',
      purpose: 'Hull and grade',
      totalGreenBeanWeight: 60,
      gradedLots: [{ grade: 'Grade A', weight: 60, price: 220.5 }],
    }

    const result = await createParchmentWithdrawal('pl-1', input)

    expect(post).toHaveBeenCalledWith('/parchment-lots/pl-1/withdrawals', input)
    expect(result.parchmentLot).toMatchObject({ id: 'pl-1', status: 'Hulled', currentWeightKg: 0 })
    expect(result.greenBeanLots).toHaveLength(1)
    expect(result.greenBeanLots[0]).toMatchObject({
      id: 'gbl-1',
      grade: 'Grade A',
      pricePerKg: 220.5,
      currency: 'THB',
      priceSetDate: '2026-09-27',
      priceSetBy: 'processor-1',
    })
  })

  it('answers with no green bean lots when an older backend leaves them out', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ parchmentLot: parchmentJson, message: 'ok' })
    const result = await createParchmentWithdrawal('pl-1', {
      amountKg: 5,
      withdrawalType: 'Sample',
      purpose: 'Sample',
    })
    expect(result.greenBeanLots).toEqual([])
  })
})

describe('transformParchmentLotFromBackend', () => {
  const sale = {
    id: 'pw-1', amountKg: 20, withdrawalType: 'Sale', date: '2026-09-21T00:00:00.000Z',
    withdrawnByName: 'Proc One',
  }

  // On someone else's lot the backend withholds the purpose with the sale.
  it('maps a withdrawal sent without its purpose and keeps the hidden flag', () => {
    const lot = transformParchmentLotFromBackend({
      ...parchmentJson,
      withdrawalHistory: [{ ...sale, saleDetailsHidden: true }],
    })
    const [row] = lot.withdrawalHistory!
    expect(row).toMatchObject({ id: 'pw-1', amountKg: 20, withdrawalType: 'Sale', saleDetailsHidden: true })
    expect(row.purpose).toBeUndefined()
    expect(row.customerName).toBeUndefined()
  })

  it("keeps the owner's purpose and sale, with no hidden flag", () => {
    const lot = transformParchmentLotFromBackend({
      ...parchmentJson,
      withdrawalHistory: [{ ...sale, purpose: 'Order 7 for Mill Co', customerName: 'Mill Co', salePrice: 150 }],
    })
    const [row] = lot.withdrawalHistory!
    expect(row).toMatchObject({ purpose: 'Order 7 for Mill Co', customerName: 'Mill Co', salePrice: 150 })
    expect(row.saleDetailsHidden).toBeUndefined()
  })
})
