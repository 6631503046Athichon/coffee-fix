import { INITIAL_APP_DATA } from '../../../constants'
import { GreenBeanSourceType, ParchmentSourceType } from '../../../types'
import type { AppData, Customer, GreenBeanLot, ParchmentLot } from '../../../types'
import { ApiError } from '../../../services/apiError'
import {
  activeWithdrawals,
  applyGreenBeanVoid,
  applyGreenBeanWithdrawalEdit,
  applyParchmentVoid,
  applyParchmentWithdrawalEdit,
  canEditWithdrawalSale,
  canVoidWithdrawal,
  isStaleWithdrawalError,
  isVoidedWithdrawal,
  madeByHullAndGrade,
  roasterIdForVoid,
  saleDetailsFromWithdrawal,
  withdrawalSaleChanges,
  withdrawalTypeLabel,
  withdrawnKgTotal,
} from './withdrawalCorrections'

// D7: a wrong withdrawal is voided (kg back, row kept and marked) and only a
// Sale's paperwork is edited in place.

const sale = { id: 'w-1', amountKg: 5, withdrawalType: 'Sale' as const, date: '2026-09-20' }
const voidedSample = { id: 'w-2', amountKg: 3, withdrawalType: 'Sample' as const, date: '2026-09-21', voidedAt: '2026-10-01T00:00:00.000Z' }

describe('voided withdrawals do not count', () => {
  it('drops voided rows from the active list and the kg total', () => {
    const rows = [sale, voidedSample, { ...sale, id: 'w-3', amountKg: 2.25 }]
    expect(isVoidedWithdrawal(voidedSample)).toBe(true)
    expect(isVoidedWithdrawal(sale)).toBe(false)
    expect(activeWithdrawals(rows).map((w) => w.id)).toEqual(['w-1', 'w-3'])
    expect(withdrawnKgTotal(rows)).toBe(7.25)
    expect(withdrawnKgTotal(undefined)).toBe(0)
  })
})

describe('who gets Void and Edit', () => {
  it('offers Void on a managed row with an id that is not void yet', () => {
    expect(canVoidWithdrawal(true, sale)).toBe(true)
    expect(canVoidWithdrawal(false, sale)).toBe(false)
    expect(canVoidWithdrawal(true, voidedSample)).toBe(false)
    expect(canVoidWithdrawal(true, { ...sale, id: undefined })).toBe(false)
  })

  it('offers Edit only on such a Sale whose sale details were sent', () => {
    expect(canEditWithdrawalSale(true, sale)).toBe(true)
    expect(canEditWithdrawalSale(false, sale)).toBe(false)
    expect(canEditWithdrawalSale(true, { ...sale, withdrawalType: 'Sample' })).toBe(false)
    expect(canEditWithdrawalSale(true, { ...sale, saleDetailsHidden: true })).toBe(false)
    expect(canEditWithdrawalSale(true, { ...sale, voidedAt: '2026-10-01' })).toBe(false)
  })

  it('tells a green bean lot a Hull & Grade made (removed by voiding it) from one bought in', () => {
    const lot = { sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'pl-1' }
    expect(madeByHullAndGrade(lot)).toBe(true)
    expect(madeByHullAndGrade({ ...lot, parchmentWithdrawalId: 'pw-1' })).toBe(true)
    expect(madeByHullAndGrade({ sourceType: GreenBeanSourceType.External })).toBe(false)
    expect(madeByHullAndGrade({ sourceType: GreenBeanSourceType.Internal })).toBe(false)
  })

  it('names the roaster a Roasting Stock void takes the kg back from, as the backend finds it', () => {
    const push = { withdrawalType: 'Roasting Stock' as const, createdAt: '2026-09-01T03:00:00.000Z' }
    const madeByPush = { roasterId: 'r-1', createdAt: '2026-09-01T03:00:01.000Z' }
    expect(roasterIdForVoid({ ...push, targetRoasterId: 'r-2' }, [madeByPush])).toBe('r-2')
    expect(roasterIdForVoid(push, [madeByPush])).toBe('r-1')
    expect(roasterIdForVoid(push, [{ roasterId: 'r-1' }])).toBe('r-1')
    expect(roasterIdForVoid(push, [madeByPush, { roasterId: 'r-3' }])).toBeUndefined()
    expect(roasterIdForVoid(push, [])).toBeUndefined()
    // A row a later claim started never held the push.
    expect(roasterIdForVoid(push, [{ roasterId: 'r-1', createdAt: '2026-09-20T03:00:00.000Z' }])).toBeUndefined()
    expect(roasterIdForVoid({ ...push, withdrawalType: 'Sale' }, [madeByPush])).toBeUndefined()
  })

  it('names the backend types the way people read them', () => {
    expect(withdrawalTypeLabel('HullAndGrade')).toBe('Hull & Grade')
    expect(withdrawalTypeLabel('RoastingStock')).toBe('Roasting Stock')
    expect(withdrawalTypeLabel('Sale')).toBe('Sale')
  })
})

describe('withdrawalSaleChanges', () => {
  const row = {
    customerName: 'Cafe Doi', deliveryAddress: '1 Road', salePrice: 400, currency: 'THB', invoiceNumber: 'INV-1',
  }
  const form = {
    customerName: 'Cafe Doi', deliveryAddress: '1 Road', salePrice: '400', currency: 'THB', invoiceNumber: 'INV-1',
  }

  it('sends nothing when nothing changed (trimmed, "400" equals 400)', () => {
    expect(withdrawalSaleChanges(row, { ...form, customerName: ' Cafe Doi ', salePrice: '400.00' }))
      .toEqual({ ok: true, changes: {} })
  })

  it('sends only what changed, and null for an emptied field', () => {
    expect(withdrawalSaleChanges(row, { ...form, salePrice: '425.5', invoiceNumber: '', customerName: 'Roastery' }))
      .toEqual({ ok: true, changes: { customerName: 'Roastery', invoiceNumber: null, salePrice: 425.5 } })
    expect(withdrawalSaleChanges(row, { ...form, salePrice: ' ' }))
      .toEqual({ ok: true, changes: { salePrice: null } })
    expect(withdrawalSaleChanges(row, { ...form, currency: 'USD' }))
      .toEqual({ ok: true, changes: { currency: 'USD' } })
  })

  it('sends the currency with a first price on a row that had none', () => {
    expect(withdrawalSaleChanges({ customerName: 'A' }, { ...form, customerName: 'A', deliveryAddress: '', invoiceNumber: '', salePrice: '100' }))
      .toEqual({ ok: true, changes: { salePrice: 100, currency: 'THB' } })
  })

  it('refuses a price that is not above 0 or has more than 2 decimals, and over-long text', () => {
    for (const bad of ['0', '-5', 'abc']) {
      expect(withdrawalSaleChanges(row, { ...form, salePrice: bad }))
        .toEqual({ ok: false, error: 'Enter a price per kg above 0, or leave it empty.' })
    }
    expect(withdrawalSaleChanges(row, { ...form, salePrice: '10.005' }))
      .toEqual({ ok: false, error: 'The price per kg can have at most 2 decimals.' })
    expect(withdrawalSaleChanges(row, { ...form, invoiceNumber: 'x'.repeat(51) }))
      .toEqual({ ok: false, error: 'Invoice number can be at most 50 characters.' })
    expect(withdrawalSaleChanges(row, { ...form, customerName: 'x'.repeat(101) }))
      .toEqual({ ok: false, error: 'Customer name can be at most 100 characters.' })
  })

  it('does not re-check stored values the user left alone, so an older sale can still be edited', () => {
    const longName = 'x'.repeat(101)
    for (const salePrice of [0, 150.555]) {
      const old = { ...row, salePrice, customerName: longName }
      expect(withdrawalSaleChanges(old, {
        ...form, customerName: longName, salePrice: String(salePrice), invoiceNumber: 'INV-2',
      })).toEqual({ ok: true, changes: { invoiceNumber: 'INV-2' } })
    }
  })
})

describe('saleDetailsFromWithdrawal', () => {
  const customers: Customer[] = [
    { id: 'c-1', name: 'Cafe Doi', type: 'Retailer', address: 'Shop address' },
    { id: 'c-2', name: 'Roastery', type: 'Roaster' },
  ]

  it('picks the customer of the recorded name and keeps the recorded address', () => {
    expect(saleDetailsFromWithdrawal(
      { customerName: ' cafe doi ', deliveryAddress: 'Typed address', salePrice: 400, currency: 'USD' },
      customers,
    )).toEqual({
      customerId: 'c-1', customerName: 'cafe doi', deliveryAddress: 'Typed address',
      salePrice: '400', currency: 'USD', targetRoasterId: '',
    })
  })

  it('keeps a name no customer has, unpicked, and THB with no price', () => {
    expect(saleDetailsFromWithdrawal({ customerName: 'Gone Ltd' }, customers)).toEqual({
      customerId: '', customerName: 'Gone Ltd', deliveryAddress: '',
      salePrice: '', currency: 'THB', targetRoasterId: '',
    })
  })
})

describe('merging a void or an edit into the app data', () => {
  const gbl = (id: string, overrides: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
    id, displayId: id.toUpperCase(), sourceType: GreenBeanSourceType.Internal, createdById: 'p-1',
    grade: 'Grade A', initialWeightKg: 20, currentWeightKg: 0, availabilityStatus: 'Withdrawn',
    cuppingScores: [], withdrawalHistory: [{ ...sale, withdrawalType: 'Roasting Stock', amountKg: 20 }],
    ...overrides,
  })
  const parchment: ParchmentLot = {
    id: 'pl-1', displayId: 'PL-1', processingBatchId: 'pb-1', sourceType: ParchmentSourceType.Internal,
    initialWeightKg: 100, currentWeightKg: 0, moistureContent: 11, processType: 'Washed', status: 'Hulled',
    withdrawalHistory: [{ id: 'pw-1', amountKg: 100, withdrawalType: 'HullAndGrade', date: '2026-09-20' }],
  }
  const data = (): AppData => ({
    ...INITIAL_APP_DATA,
    parchmentLots: [parchment],
    greenBeanLots: [gbl('gbl-1'), gbl('gbl-2', { parchmentLotId: 'pl-1' }), gbl('gbl-3', { parchmentLotId: 'pl-1' })],
    roasterInventory: [
      { id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 25, remainingWeightKg: 22, grade: 'Grade A' },
      { id: 'inv-2', roasterId: 'r-2', greenBeanLotId: 'gbl-1', claimedWeightKg: 4, remainingWeightKg: 4 },
    ],
  })

  it('a green-bean void takes the lot kg, status and history from the reply and the roaster row it emptied', () => {
    const voidedRow = { ...sale, withdrawalType: 'Roasting Stock' as const, amountKg: 20, voidedAt: '2026-10-04T00:00:00.000Z' }
    const next = applyGreenBeanVoid(data(), 'gbl-1', {
      greenBeanLot: gbl('gbl-1', { currentWeightKg: 20, availabilityStatus: 'Available', withdrawalHistory: [voidedRow] }),
      withdrawal: voidedRow,
      roasterInventoryItem: { id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 5, remainingWeightKg: 2 },
    })
    const lot = next.greenBeanLots.find((g) => g.id === 'gbl-1')!
    expect(lot.currentWeightKg).toBe(20)
    expect(lot.availabilityStatus).toBe('Available')
    expect(lot.withdrawalHistory).toEqual([voidedRow])
    // Enriched fields on the stored stock row are kept; the other row untouched.
    expect(next.roasterInventory[0]).toEqual({
      id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 5, remainingWeightKg: 2, grade: 'Grade A',
    })
    expect(next.roasterInventory[1]).toEqual(data().roasterInventory[1])
    expect(next.greenBeanLots.find((g) => g.id === 'gbl-2')!.currentWeightKg).toBe(0)
  })

  it('a parchment void puts the kg and status back and drops the green bean lots it removed', () => {
    const voidedRow = { id: 'pw-1', amountKg: 100, withdrawalType: 'HullAndGrade' as const, date: '2026-09-20', voidedAt: '2026-10-04T00:00:00.000Z' }
    const next = applyParchmentVoid(data(), 'pl-1', {
      parchmentLot: { ...parchment, currentWeightKg: 100, status: 'AwaitingHulling', withdrawalHistory: [voidedRow] },
      withdrawal: voidedRow,
      removedGreenBeanLots: [
        { id: 'gbl-2', displayId: 'GBL-2', grade: 'Grade A', initialWeightKg: 20 },
        { id: 'gbl-3', displayId: 'GBL-3', grade: 'Grade A', initialWeightKg: 20 },
      ],
    })
    expect(next.parchmentLots[0]).toMatchObject({ currentWeightKg: 100, status: 'AwaitingHulling', withdrawalHistory: [voidedRow] })
    expect(next.greenBeanLots.map((g) => g.id)).toEqual(['gbl-1'])
  })

  it('an edit swaps the row with that id in, keeping the fields the reply lacks', () => {
    const start = data()
    start.greenBeanLots[0].withdrawalHistory = [
      { ...sale, customerName: 'Old', withdrawnByName: 'Processor' },
      { ...sale, id: 'w-9' },
    ]
    const next = applyGreenBeanWithdrawalEdit(start, 'gbl-1', { ...sale, customerName: 'New', salePrice: 410, totalAmount: 2050 })
    expect(next.greenBeanLots[0].withdrawalHistory).toEqual([
      { ...sale, customerName: 'New', salePrice: 410, totalAmount: 2050, withdrawnByName: 'Processor' },
      { ...sale, id: 'w-9' },
    ])

    const nextParchment = applyParchmentWithdrawalEdit(data(), 'pl-1', {
      id: 'pw-1', amountKg: 100, withdrawalType: 'HullAndGrade', date: '2026-09-20', invoiceNumber: 'INV-7',
    })
    expect(nextParchment.parchmentLots[0].withdrawalHistory?.[0].invoiceNumber).toBe('INV-7')
  })
})

describe('isStaleWithdrawalError', () => {
  it('reloads for a row that is gone or already void, not for other refusals', () => {
    expect(isStaleWithdrawalError(new ApiError('Withdrawal not found', 404))).toBe(true)
    expect(isStaleWithdrawalError(new ApiError('This withdrawal is already void.', 409))).toBe(true)
    expect(isStaleWithdrawalError(new ApiError('A void withdrawal cannot be edited.', 409))).toBe(true)
    expect(isStaleWithdrawalError(new ApiError('Roastery already used these kg', 409))).toBe(false)
    expect(isStaleWithdrawalError(new Error('Withdrawal not found'))).toBe(false)
  })
})
