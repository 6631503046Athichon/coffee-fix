import { describe, expect, it } from 'vitest'
import { UserRole } from '../../../types'
import type { Customer, User } from '../../../types'
import {
  EMPTY_WITHDRAW_DETAILS,
  ROASTER_REQUIRED_MESSAGE,
  buildWithdrawDetailsPayload,
  formatMoney,
  formatWithdrawTotal,
  pickWithdrawCustomer,
  upsertCustomer,
  withdrawCustomerOptions,
  withdrawDetailsError,
  withdrawDetailsForLot,
  withdrawDetailsForLots,
  withdrawRoasterOptions,
  withdrawSaleTotal,
} from './withdrawDetails'
import type { WithdrawDetails, WithdrawalType } from './withdrawDetails'

const cafe: Customer = { id: 'c-1', name: 'Cafe Doi', type: 'Retailer', address: '12 Nimman Rd' }
const aroma: Customer = { id: 'c-2', name: 'Aroma Co', type: 'Distributor' }

const sale: WithdrawDetails = {
  ...EMPTY_WITHDRAW_DETAILS,
  salePrice: '180',
  customerId: 'c-1',
  customerName: 'Cafe Doi',
  deliveryAddress: '12 Nimman Rd',
  // Left over from switching type: only the roaster type may send it.
  targetRoasterId: 'r-1',
}

describe('withdrawDetailsError', () => {
  it('requires the roaster for Roasting Stock only', () => {
    expect(withdrawDetailsError('Roasting Stock', EMPTY_WITHDRAW_DETAILS)).toBe(ROASTER_REQUIRED_MESSAGE)
    expect(withdrawDetailsError('Roasting Stock', { ...EMPTY_WITHDRAW_DETAILS, targetRoasterId: 'r-1' })).toBeNull()
    for (const type of ['Sale', 'Sample', 'Export', 'Other'] as WithdrawalType[]) {
      expect(withdrawDetailsError(type, EMPTY_WITHDRAW_DETAILS)).toBeNull()
    }
  })

  it('leaves the Sale customer and price optional and accepts any typed price, as the Workbench did', () => {
    expect(withdrawDetailsError('Sale', EMPTY_WITHDRAW_DETAILS)).toBeNull()
    for (const price of ['180', '180.5', '180.50', '0.01', '1.234']) {
      expect(withdrawDetailsError('Sale', { ...EMPTY_WITHDRAW_DETAILS, salePrice: price })).toBeNull()
    }
    expect(buildWithdrawDetailsPayload('Sale', { ...EMPTY_WITHDRAW_DETAILS, salePrice: '1.234' }).salePrice)
      .toBe(1.234)
  })
})

describe('buildWithdrawDetailsPayload', () => {
  it('sends price, currency, customer and address for a Sale', () => {
    expect(buildWithdrawDetailsPayload('Sale', { ...sale, currency: 'USD' })).toEqual({
      salePrice: 180,
      currency: 'USD',
      customerName: 'Cafe Doi',
      deliveryAddress: '12 Nimman Rd',
    })
  })

  it('sends a Sale without customer or price as only its currency', () => {
    const payload = buildWithdrawDetailsPayload('Sale', EMPTY_WITHDRAW_DETAILS)
    expect(payload).toEqual({
      salePrice: undefined, currency: 'THB', customerName: undefined, deliveryAddress: undefined,
    })
    // JSON drops the undefined keys, as before the extraction.
    expect(JSON.parse(JSON.stringify(payload))).toEqual({ currency: 'THB' })
  })

  it('sends only the roaster for Roasting Stock', () => {
    expect(buildWithdrawDetailsPayload('Roasting Stock', sale)).toEqual({ targetRoasterId: 'r-1' })
  })

  it.each(['Sample', 'Export', 'Other'] as WithdrawalType[])('adds nothing for %s', (type) => {
    expect(buildWithdrawDetailsPayload(type, sale)).toEqual({})
  })
})

describe('sale total', () => {
  it('is the amount times the price for a Sale with both above 0', () => {
    expect(withdrawSaleTotal('Sale', 8, sale)).toBe(1440)
    expect(withdrawSaleTotal('Sale', 0, sale)).toBeNull()
    expect(withdrawSaleTotal('Sale', 8, { ...sale, salePrice: '' })).toBeNull()
    expect(withdrawSaleTotal('Sale', 8, { ...sale, salePrice: '0' })).toBeNull()
    expect(withdrawSaleTotal('Roasting Stock', 8, sale)).toBeNull()
  })

  it('shows two decimals and the currency', () => {
    expect(formatWithdrawTotal(1440, 'THB')).toBe(`${(1440).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })} THB`)
    expect(formatWithdrawTotal(2.5, 'USD')).toMatch(/^2[.,]50 USD$/)
  })
})

describe('customer picker', () => {
  it('lists customers by name and offers No customer once one is picked', () => {
    expect(withdrawCustomerOptions([cafe, aroma], '')).toEqual([
      { value: 'c-2', label: 'Aroma Co (Distributor)' },
      { value: 'c-1', label: 'Cafe Doi (Retailer)' },
    ])
    expect(withdrawCustomerOptions([cafe, aroma], 'c-1')[0]).toEqual({ value: '', label: 'No customer' })
  })

  it('fills the address from the pick, drops a filled-in one and keeps a typed one', () => {
    const picked = pickWithdrawCustomer(EMPTY_WITHDRAW_DETAILS, cafe, [cafe, aroma])
    expect(picked).toMatchObject({ customerId: 'c-1', customerName: 'Cafe Doi', deliveryAddress: '12 Nimman Rd' })

    const noAddress = pickWithdrawCustomer(picked, aroma, [cafe, aroma])
    expect(noAddress).toMatchObject({ customerId: 'c-2', customerName: 'Aroma Co', deliveryAddress: '' })

    const typed = pickWithdrawCustomer({ ...noAddress, deliveryAddress: 'Gate 2' }, undefined, [cafe, aroma])
    expect(typed).toMatchObject({ customerId: '', customerName: '', deliveryAddress: 'Gate 2' })
  })

  it('adds a new customer at the top or replaces a known one in place', () => {
    const hill: Customer = { id: 'c-9', name: 'Hill', type: 'Roaster' }
    expect(upsertCustomer([cafe, aroma], hill)).toEqual([hill, cafe, aroma])
    const renamed = { ...aroma, name: 'Aroma Coffee' }
    expect(upsertCustomer([cafe, aroma], renamed)).toEqual([cafe, renamed])
  })
})

describe('withdrawRoasterOptions', () => {
  it('offers every active user with the Roaster role, by name', () => {
    const users: User[] = [
      { id: 'r-1', name: 'Hill Roastery', roles: [UserRole.Roaster] },
      { id: 'p-1', name: 'Processor', roles: [UserRole.Processor] },
      { id: 'a-1', name: 'Admin Roaster', roles: [UserRole.Admin, UserRole.Roaster], isActive: true },
    ]
    expect(withdrawRoasterOptions(users)).toEqual([
      { value: 'a-1', label: 'Admin Roaster' },
      { value: 'r-1', label: 'Hill Roastery' },
    ])
  })

  it('leaves out a deactivated roaster, which an Admin user list still holds', () => {
    const users: User[] = [
      { id: 'r-2', name: 'Old Roastery', roles: [UserRole.Roaster], isActive: false },
      { id: 'r-1', name: 'Hill Roastery', roles: [UserRole.Roaster], isActive: true },
    ]
    expect(withdrawRoasterOptions(users)).toEqual([{ value: 'r-1', label: 'Hill Roastery' }])
    // The input list is left in its own order.
    expect(users.map((u) => u.id)).toEqual(['r-2', 'r-1'])
  })
})

describe('money and the Sale price a lot starts with', () => {
  it('writes money with thousands separators and 2 decimals', () => {
    expect(formatMoney(1000)).toBe('1,000.00')
    expect(formatMoney(1234.5)).toBe('1,234.50')
    expect(formatMoney(0)).toBe('0.00')
  })

  it("starts from the lot's set price and currency", () => {
    expect(withdrawDetailsForLot({ pricePerKg: 250, currency: 'THB' })).toEqual({
      ...EMPTY_WITHDRAW_DETAILS, salePrice: '250', currency: 'THB',
    })
    expect(withdrawDetailsForLot({ pricePerKg: 12.5, currency: 'USD' })).toMatchObject({ salePrice: '12.5', currency: 'USD' })
    expect(withdrawDetailsForLot({ pricePerKg: 250 })).toMatchObject({ salePrice: '250', currency: 'THB' })
  })

  it('starts empty without a price, or in a currency the picker does not offer', () => {
    expect(withdrawDetailsForLot({})).toEqual(EMPTY_WITHDRAW_DETAILS)
    expect(withdrawDetailsForLot(null)).toEqual(EMPTY_WITHDRAW_DETAILS)
    expect(withdrawDetailsForLot({ pricePerKg: 0, currency: 'THB' })).toEqual(EMPTY_WITHDRAW_DETAILS)
    expect(withdrawDetailsForLot({ pricePerKg: 90, currency: 'JPY' })).toEqual(EMPTY_WITHDRAW_DETAILS)
  })

  it('starts a several-lot withdrawal from their price only when every lot has the same', () => {
    expect(withdrawDetailsForLots([
      { pricePerKg: 250, currency: 'THB' },
      { pricePerKg: 250 }, // no currency is THB
    ])).toEqual({ ...EMPTY_WITHDRAW_DETAILS, salePrice: '250', currency: 'THB' })
    expect(withdrawDetailsForLots([{ pricePerKg: 12.5, currency: 'USD' }])).toMatchObject({ salePrice: '12.5', currency: 'USD' })

    // Mixed prices, mixed currencies, or a lot without a price: empty.
    expect(withdrawDetailsForLots([{ pricePerKg: 250, currency: 'THB' }, { pricePerKg: 240, currency: 'THB' }]))
      .toEqual(EMPTY_WITHDRAW_DETAILS)
    expect(withdrawDetailsForLots([{ pricePerKg: 250, currency: 'THB' }, { pricePerKg: 250, currency: 'USD' }]))
      .toEqual(EMPTY_WITHDRAW_DETAILS)
    expect(withdrawDetailsForLots([{ pricePerKg: 250, currency: 'THB' }, {}])).toEqual(EMPTY_WITHDRAW_DETAILS)
    expect(withdrawDetailsForLots([])).toEqual(EMPTY_WITHDRAW_DETAILS)
  })
})
