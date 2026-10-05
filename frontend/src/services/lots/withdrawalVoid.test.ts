import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import {
  transformGreenBeanLotFromBackend,
  updateGreenBeanWithdrawal,
  voidGreenBeanWithdrawal,
} from './greenBeanLotService'
import {
  getParchmentWithdrawals,
  transformParchmentLotFromBackend,
  updateParchmentWithdrawal,
  voidParchmentWithdrawal,
} from './parchmentLotService'

// D7 endpoints: POST .../withdrawals/:withdrawalId/void and PATCH
// .../withdrawals/:withdrawalId, on green-bean and parchment lots.

// Typed loose, as the transform takes what the backend sends.
const greenJson = (history: any[] = []): any => ({
  id: 'gbl-1', displayId: 'GBL-2026-9', sourceType: 'Internal', createdById: 'p-1',
  parchmentWithdrawalId: 'pw-7', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 50,
  availabilityStatus: 'Available', withdrawalHistory: history,
})

const voidedPush = {
  id: 'w-1', amountKg: 10, withdrawalType: 'RoastingStock', date: '2026-09-20T00:00:00.000Z',
  targetRoasterId: 'r-1', voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'p-1', voidReason: 'Wrong roaster',
}

const parchmentJson = (history: unknown[] = []) => ({
  id: 'pl-1', displayId: 'PL-2026-3', processingBatchId: 'pb-1', sourceType: 'Internal',
  initialWeightKg: 100, currentWeightKg: 100, moistureContent: 11, processType: 'Washed',
  status: 'AwaitingHulling', withdrawalHistory: history,
})

describe('green-bean withdrawals', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keep the id, the roaster and the void fields, and the lot keeps the Hull & Grade that made it', () => {
    const lot = transformGreenBeanLotFromBackend(greenJson([voidedPush]))
    expect(lot.parchmentWithdrawalId).toBe('pw-7')
    expect(lot.withdrawalHistory?.[0]).toMatchObject({
      id: 'w-1', withdrawalType: 'Roasting Stock', date: '2026-09-20', targetRoasterId: 'r-1',
      voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'p-1', voidReason: 'Wrong roaster',
    })
  })

  it('void posts the trimmed reason, or an empty body without one, and maps the reply', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      greenBeanLot: greenJson([voidedPush]),
      withdrawal: voidedPush,
      roasterInventoryItem: { id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 0, remainingWeightKg: 0 },
      message: 'Withdrawal voided',
    })

    const result = await voidGreenBeanWithdrawal('gbl-1', 'w-1', '  Wrong roaster  ')
    expect(post).toHaveBeenCalledWith('/green-bean-lots/gbl-1/withdrawals/w-1/void', { reason: 'Wrong roaster' })
    expect(result.greenBeanLot.currentWeightKg).toBe(50)
    expect(result.withdrawal).toMatchObject({ id: 'w-1', withdrawalType: 'Roasting Stock', voidedAt: voidedPush.voidedAt })
    expect(result.roasterInventoryItem).toEqual({
      id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 0, remainingWeightKg: 0,
    })
    expect(result.roasterInventoryItemRemoved).toBe(false)

    post.mockResolvedValue({ greenBeanLot: greenJson(), withdrawal: voidedPush, roasterInventoryItem: null })
    const plain = await voidGreenBeanWithdrawal('gbl-1', 'w-1', '   ')
    expect(post).toHaveBeenLastCalledWith('/green-bean-lots/gbl-1/withdrawals/w-1/void', {})
    expect(plain.roasterInventoryItem).toBeNull()
  })

  it('void says when the backend removed the roaster stock row it left holding nothing', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      greenBeanLot: greenJson([voidedPush]),
      withdrawal: voidedPush,
      roasterInventoryItem: { id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 0, remainingWeightKg: 0 },
      roasterInventoryItemRemoved: true,
      message: 'Withdrawal voided',
    })
    const result = await voidGreenBeanWithdrawal('gbl-1', 'w-1')
    expect(result.roasterInventoryItemRemoved).toBe(true)
    expect(result.roasterInventoryItem?.id).toBe('inv-1')
  })

  it('edit patches only the given sale fields and maps the row back', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({
      withdrawal: { id: 'w-2', amountKg: 5, withdrawalType: 'Sale', date: '2026-09-20T00:00:00.000Z', salePrice: 410, totalAmount: 2050 },
      message: 'Withdrawal updated',
    })
    const row = await updateGreenBeanWithdrawal('gbl-1', 'w-2', { salePrice: 410, invoiceNumber: null })
    expect(patch).toHaveBeenCalledWith('/green-bean-lots/gbl-1/withdrawals/w-2', { salePrice: 410, invoiceNumber: null })
    expect(row).toMatchObject({ id: 'w-2', date: '2026-09-20', salePrice: 410, totalAmount: 2050 })
  })
})

describe('parchment withdrawals', () => {
  afterEach(() => vi.restoreAllMocks())

  const hull = {
    id: 'pw-1', amountKg: 100, withdrawalType: 'HullAndGrade', date: '2026-09-20T00:00:00.000Z',
    invoiceNumber: 'INV-3', voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'p-1', voidReason: 'Wrong split',
  }

  it('keep the invoice number and the void fields', () => {
    const lot = transformParchmentLotFromBackend(parchmentJson([hull]))
    expect(lot.withdrawalHistory?.[0]).toMatchObject({
      id: 'pw-1', invoiceNumber: 'INV-3', voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'p-1', voidReason: 'Wrong split',
    })
    const plain = transformParchmentLotFromBackend(parchmentJson([{ ...hull, voidedAt: null, voidedById: null, voidReason: null }]))
    expect(plain.withdrawalHistory?.[0].voidedAt).toBeUndefined()
  })

  it('are loaded by the lot batch, or by process type for a lot with no batch', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      parchmentLots: [parchmentJson([hull]), { ...parchmentJson(), id: 'pl-other' }],
    })
    const rows = await getParchmentWithdrawals({ id: 'pl-1', processingBatchId: 'pb-1', processType: 'Washed' })
    expect(get).toHaveBeenCalledWith('/parchment-lots', { processingBatchId: 'pb-1' })
    expect(rows?.map((w) => w.id)).toEqual(['pw-1'])

    await getParchmentWithdrawals({ id: 'pl-1', processType: 'Washed' })
    expect(get).toHaveBeenLastCalledWith('/parchment-lots', { processType: 'Washed', limit: '200' })

    expect(await getParchmentWithdrawals({ id: 'pl-missing', processType: 'Washed' })).toBeNull()
  })

  it('void posts the reason and returns the removed green bean lots', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      parchmentLot: parchmentJson([hull]),
      withdrawal: hull,
      removedGreenBeanLots: [{ id: 'gbl-1', displayId: 'GBL-1', grade: 'Grade A', initialWeightKg: 60 }],
      message: 'Withdrawal voided',
    })
    const result = await voidParchmentWithdrawal('pl-1', 'pw-1', 'Wrong split')
    expect(post).toHaveBeenCalledWith('/parchment-lots/pl-1/withdrawals/pw-1/void', { reason: 'Wrong split' })
    expect(result.parchmentLot).toMatchObject({ currentWeightKg: 100, status: 'AwaitingHulling' })
    expect(result.removedGreenBeanLots).toEqual([{ id: 'gbl-1', displayId: 'GBL-1', grade: 'Grade A', initialWeightKg: 60 }])

    post.mockResolvedValue({ parchmentLot: parchmentJson(), withdrawal: hull })
    expect((await voidParchmentWithdrawal('pl-1', 'pw-1')).removedGreenBeanLots).toEqual([])
    expect(post).toHaveBeenLastCalledWith('/parchment-lots/pl-1/withdrawals/pw-1/void', {})
  })

  it('edit patches the sale fields', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({
      withdrawal: { id: 'pw-2', amountKg: 20, withdrawalType: 'Sale', date: '2026-09-20T00:00:00.000Z', customerName: 'Mill' },
    })
    const row = await updateParchmentWithdrawal('pl-1', 'pw-2', { customerName: 'Mill' })
    expect(patch).toHaveBeenCalledWith('/parchment-lots/pl-1/withdrawals/pw-2', { customerName: 'Mill' })
    expect(row).toMatchObject({ id: 'pw-2', customerName: 'Mill' })
  })
})
