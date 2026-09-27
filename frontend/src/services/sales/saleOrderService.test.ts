import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoastBatch, RoasterInventoryItem } from '../../types'
import { appData, sale } from '../../test/salesFixtures'
import { toRoaId } from '../../utils/formatters'
import { api } from '../api'
import {
  applySaleChange,
  createSaleOrder,
  getSellableGreenLots,
  transformSaleOrderFromBackend,
} from './saleOrderService'

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

  it('maps a green-bean line to its stock row and green summary', () => {
    const lotId = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
    const greenJson = {
      id: 'inv-1',
      label: 'ROA-4412',
      greenBeanLotId: lotId,
      greenBeanLotDisplayId: 'GBL-2026-7',
      grade: 'Grade A',
      variety: 'Typica',
      process: null,
      availableKg: 7,
    }
    const order = transformSaleOrderFromBackend({
      ...saleJson,
      items: [
        {
          id: 'item-g',
          roastBatchId: null,
          roasterInventoryId: 'inv-1',
          greenBeanLotId: lotId,
          lotGrade: 'Grade A',
          quantity: 5,
          pricePerKg: 320,
          subtotal: 1600,
          roast: null,
          green: greenJson,
        },
        {
          id: 'item-g2',
          roastBatchId: null,
          roasterInventoryId: 'inv-2',
          greenBeanLotId: lotId,
          lotGrade: 'Grade A',
          quantity: 1,
          pricePerKg: 320,
          subtotal: 320,
          roast: null,
          green: { ...greenJson, id: 'inv-2', label: null, availableKg: undefined },
        },
      ],
    })

    const [line, unlabelled] = order.items
    expect(line.roastBatchId).toBeUndefined()
    expect(line.roasterInventoryId).toBe('inv-1')
    expect(line.roast).toBeUndefined()
    expect(line.green).toEqual({
      id: 'inv-1',
      label: 'ROA-4412',
      greenBeanLotId: lotId,
      greenBeanLotDisplayId: 'GBL-2026-7',
      grade: 'Grade A',
      variety: 'Typica',
      process: undefined,
      availableKg: 7,
    })
    expect(unlabelled.green?.label).toBe(toRoaId(lotId))
    expect(unlabelled.green?.availableKg).toBe(0)
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

describe('getSellableGreenLots', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("asks for the viewer's own stock, or a roaster's when given", async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      greenLots: [
        {
          id: 'inv-1',
          label: 'ROA-4412',
          greenBeanLotId: 'gbl-9',
          greenBeanLotDisplayId: null,
          grade: 'Grade A',
          variety: 'Typica',
          process: 'Washed',
          availableKg: 8.456,
          roasterId: 'roaster-1',
        },
      ],
    })

    const lots = await getSellableGreenLots()
    expect(get).toHaveBeenLastCalledWith('/roaster-inventory/sellable', undefined)
    expect(lots).toEqual([
      {
        id: 'inv-1',
        label: 'ROA-4412',
        greenBeanLotId: 'gbl-9',
        greenBeanLotDisplayId: undefined,
        grade: 'Grade A',
        variety: 'Typica',
        process: 'Washed',
        availableKg: 8.456,
        roasterId: 'roaster-1',
      },
    ])

    await getSellableGreenLots('roaster-1')
    expect(get).toHaveBeenLastCalledWith('/roaster-inventory/sellable', { roasterId: 'roaster-1' })
  })
})

describe('createSaleOrder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const input = {
    customerId: 'cust-1',
    orderDate: '2026-09-20',
    currency: 'THB',
    notes: null,
    items: [{ roasterInventoryId: 'inv-1', quantity: 2, pricePerKg: 300 }],
  }

  it('sends sellerId only when one is given', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ saleOrder: saleJson })

    await createSaleOrder(input)
    expect(post).toHaveBeenLastCalledWith('/sale-orders', input)
    expect(post.mock.lastCall?.[1]).not.toHaveProperty('sellerId')

    await createSaleOrder({ ...input, sellerId: undefined })
    expect(post.mock.lastCall?.[1]).not.toHaveProperty('sellerId')

    await createSaleOrder({ ...input, sellerId: 'user-roaster' })
    expect(post).toHaveBeenLastCalledWith('/sale-orders', { ...input, sellerId: 'user-roaster' })
  })

  it('returns the saved sale and the stock it touched', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      saleOrder: saleJson,
      affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 10 }],
    })

    const result = await createSaleOrder({ ...input, sellerId: 'user-roaster' })
    expect(result.saleOrder.orderNumber).toBe('ORD-2026-0007')
    expect(result.affectedRoastBatches).toEqual([])
    expect(result.affectedInventoryItems).toEqual([{ id: 'inv-1', remainingWeightKg: 10 }])
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

  it('patches remainingWeightKg on the stock rows the change touched', () => {
    const row = (id: string): RoasterInventoryItem => ({
      id,
      roasterId: 'user-roaster',
      greenBeanLotId: 'gbl-1',
      claimedWeightKg: 20,
      remainingWeightKg: 12,
    })
    const prev = appData({ roasterInventory: [row('inv-1'), row('inv-2')] })

    const next = applySaleChange(prev, {
      upsert: sale(),
      affectedInventoryItems: [{ id: 'inv-2', remainingWeightKg: 7 }],
    })

    expect(next.roasterInventory[0]).toBe(prev.roasterInventory[0])
    expect(next.roasterInventory[1]).toEqual({ ...row('inv-2'), remainingWeightKg: 7 })
    expect(applySaleChange(prev, { upsert: sale() }).roasterInventory).toBe(prev.roasterInventory)
  })
})
