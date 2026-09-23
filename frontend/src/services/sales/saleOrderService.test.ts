import { describe, expect, it } from 'vitest'
import type { RoastBatch } from '../../types'
import { appData, sale } from '../../test/salesFixtures'
import { applySaleChange, transformSaleOrderFromBackend } from './saleOrderService'

const roastJson = {
  id: '3f2b8c1a-0000-4000-8000-000000000001',
  label: 'RB-0421',
  roastDate: '2026-09-10T05:00:00.000Z',
  roastLevel: 'Medium',
  roastedWeightKg: 10,
  soldWeightKg: 2.5,
  availableKg: 7.5,
  greenBeanLotId: 'gbl-1',
  greenBeanLotDisplayId: 'GBL-2026-7',
  grade: null,
  variety: 'Typica',
  process: 'Washed',
}

const saleJson = {
  id: 'sale-1',
  orderNumber: 'ORD-2026-0007',
  customerId: 'cust-1',
  customerName: 'Cafe Aroma',
  customerPhone: '081 234 5678',
  customerAddress: null,
  customer: {
    id: 'cust-1',
    name: 'Cafe Aroma (renamed)',
    type: 'Retailer',
    contactEmail: null,
    contactPhone: '099',
    address: null,
  },
  orderDate: '2026-09-20T12:00:00.000Z',
  status: 'Confirmed',
  totalAmount: 950,
  currency: 'THB',
  notes: null,
  createdBy: 'user-roaster',
  creatorName: 'Bean Roasters',
  invoiceCount: 1,
  createdAt: '2026-09-20T03:00:00.000Z',
  updatedAt: '2026-09-20T03:00:01.000Z',
  items: [
    {
      id: 'item-1',
      roastBatchId: roastJson.id,
      greenBeanLotId: 'gbl-1',
      lotGrade: 'Grade A',
      quantity: 2.5,
      pricePerKg: 380,
      subtotal: 950,
      roast: roastJson,
    },
    {
      id: 'item-2',
      roastBatchId: null,
      greenBeanLotId: 'gbl-9',
      lotGrade: 'Grade B',
      quantity: 1,
      pricePerKg: 0,
      subtotal: 0,
      roast: null,
    },
  ],
}

describe('transformSaleOrderFromBackend', () => {
  it('maps a roast line and a legacy line', () => {
    const order = transformSaleOrderFromBackend(saleJson)

    expect(order.orderDate).toBe('2026-09-20')
    expect(order.customerName).toBe('Cafe Aroma')
    expect(order.customerPhone).toBe('081 234 5678')
    expect(order.customerAddress).toBeUndefined()
    expect(order.customer).toEqual({
      id: 'cust-1',
      name: 'Cafe Aroma (renamed)',
      type: 'Retailer',
      contactEmail: undefined,
      contactPhone: '099',
      address: undefined,
    })
    expect(order.invoiceCount).toBe(1)
    expect(order.updatedAt).toBe('2026-09-20T03:00:01.000Z')
    expect(order.notes).toBeUndefined()

    const [roastLine, legacyLine] = order.items
    expect(roastLine.roastBatchId).toBe(roastJson.id)
    expect(roastLine.roast).toEqual({
      id: roastJson.id,
      label: 'RB-0421',
      roastDate: '2026-09-10',
      roastLevel: 'Medium',
      roastedWeightKg: 10,
      soldWeightKg: 2.5,
      availableKg: 7.5,
      greenBeanLotId: 'gbl-1',
      greenBeanLotDisplayId: 'GBL-2026-7',
      grade: undefined,
      variety: 'Typica',
      process: 'Washed',
    })
    expect(legacyLine.roastBatchId).toBeUndefined()
    expect(legacyLine.roast).toBeUndefined()
    expect(legacyLine.lotGrade).toBe('Grade B')
  })

  it('does not throw on the sale JSON of the older backend', () => {
    const old = {
      id: 'sale-old',
      orderNumber: 'ORD-2025-0001',
      customerId: 'cust-1',
      customerName: '',
      customer: { id: 'cust-1', name: 'Cafe Aroma', type: 'Retailer' },
      orderDate: '2025-12-01T00:00:00.000Z',
      status: 'Draft',
      totalAmount: 100,
      currency: null,
      createdBy: 'user-roaster',
      creator: { id: 'user-roaster', name: 'Bean Roasters' },
      _count: { invoices: 2 },
      items: [{ id: 'i', greenBeanLotId: 'gbl-1', greenBeanLot: { grade: 'AA' }, quantity: 1, pricePerKg: 100, subtotal: 100 }],
    }

    const order = transformSaleOrderFromBackend(old)

    expect(order.customerName).toBe('Cafe Aroma')
    expect(order.currency).toBe('THB')
    expect(order.creatorName).toBe('Bean Roasters')
    expect(order.invoiceCount).toBe(2)
    expect(order.updatedAt).toBe('')
    expect(order.createdAt).toBe('')
    expect(order.items[0]).toMatchObject({ lotGrade: 'AA', roast: undefined, roastBatchId: undefined })
  })
})

describe('applySaleChange', () => {
  const older = sale({ id: 'a', orderDate: '2026-09-01', createdAt: '2026-09-01T01:00:00.000Z' })
  const newer = sale({ id: 'b', orderDate: '2026-09-15', createdAt: '2026-09-15T01:00:00.000Z' })

  it('inserts a new sale in newest-first order (date, then time recorded)', () => {
    const sameDayLater = sale({ id: 'c', orderDate: '2026-09-15', createdAt: '2026-09-15T09:00:00.000Z' })
    const next = applySaleChange(appData({ saleOrders: [newer, older] }), { upsert: sameDayLater })
    expect(next.saleOrders.map((o) => o.id)).toEqual(['c', 'b', 'a'])

    const backdated = sale({ id: 'd', orderDate: '2026-08-01', createdAt: '2026-09-23T09:00:00.000Z' })
    expect(applySaleChange(next, { upsert: backdated }).saleOrders.map((o) => o.id)).toEqual([
      'c',
      'b',
      'a',
      'd',
    ])
  })

  it('replaces an edited sale and re-sorts when its date moves', () => {
    const moved = { ...older, orderDate: '2026-09-20', status: 'Delivered' as const }
    const next = applySaleChange(appData({ saleOrders: [newer, older] }), { upsert: moved })
    expect(next.saleOrders).toHaveLength(2)
    expect(next.saleOrders[0]).toBe(moved)
  })

  it('removes a sale', () => {
    const next = applySaleChange(appData({ saleOrders: [newer, older] }), { removeId: 'b' })
    expect(next.saleOrders.map((o) => o.id)).toEqual(['a'])
  })

  it('patches soldWeightKg on the roasts the change touched', () => {
    const batch = (id: string): RoastBatch => ({
      id,
      roasterId: 'user-roaster',
      roasterInventoryId: 'inv-1',
      greenBeanLotId: 'gbl-1',
      roastDate: '2026-09-10',
      batchSizeKg: 12,
      yieldPercentage: 83,
      roastedWeightKg: 10,
      soldWeightKg: 0,
      roastProfileNotes: '',
    })
    const prev = appData({ roastBatches: [batch('rb-1'), batch('rb-2')] })

    const next = applySaleChange(prev, {
      upsert: sale(),
      affectedRoastBatches: [{ id: 'rb-2', soldWeightKg: 3.5, availableKg: 6.5 }],
    })

    expect(next.roastBatches[0]).toBe(prev.roastBatches[0])
    expect(next.roastBatches[1].soldWeightKg).toBe(3.5)
  })
})
