/**
 * Green bean sales: roasters sell green beans from their own stock
 * (RoasterInventoryItem) on the same sales as roasted coffee.
 * /api/sale-orders, /api/sale-orders/[id], /api/roaster-inventory/sellable,
 * PUT /api/roaster-inventory/[id] and the lib helpers behind them.
 *
 * Writes live only on `mockTx`, the client the transaction callback gets, so
 * a write that escaped the transaction would hit an undefined function on
 * `mockPrisma` and fail the test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'
import * as ts from 'typescript'
import {
  applyGreenReservationChange,
  priceLines,
  reservationsByInventory,
  roaLabel,
} from '@/lib/saleOrders'

const mockTx: any = {
  saleOrder: {
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  saleOrderItem: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
  },
  invoice: {
    deleteMany: jest.fn(),
  },
  roastBatch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  roasterInventoryItem: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
}

const mockPrisma: any = {
  saleOrder: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  customer: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  roastBatch: {
    findMany: jest.fn(),
  },
  roasterInventoryItem: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(mockTx)),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

jest.mock('@/lib/documentNumbers', () => ({
  getNextSaleOrderNumber: async () => 'ORD-2026-0001',
  isUniqueConstraintError: (e: any) => e?.code === 'P2002',
}))

let mockAuthUser: any = null

jest.mock('@/lib/middleware', () => ({
  requireAuth: jest.fn(async () => {
    if (!mockAuthUser) throw new Error('Unauthorized')
    return mockAuthUser
  }),
  requireRole: jest.fn((user: any, roles: string[]) => {
    if (!user.isSuperAdmin && !user.roles.some((role: string) => roles.includes(role))) {
      throw new Error('Insufficient permissions')
    }
  }),
  requireOwnership: jest.fn(
    (user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
      if (user.isSuperAdmin) return
      if (user.roles.some((role: string) => allowedRoles.includes(role))) return
      if (!ownerId || user.id !== ownerId) throw new Error('Insufficient permissions')
    },
  ),
  // Same bodies as the real handleApiError for the errors these routes throw.
  handleApiError: jest.fn((error: any) => {
    const [status, message] =
      error.message === 'Unauthorized'
        ? [401, 'Unauthorized']
        : error.message === 'Insufficient permissions'
          ? [403, 'Forbidden']
          : [500, error.message]
    return new Response(JSON.stringify({ error: message }), { status })
  }),
}))

const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const otherRoaster = { id: 'roaster-2', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const processor = { id: 'processor-1', roles: ['Processor'], isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isSuperAdmin: true }

// Real v4 UUIDs: zod's uuid() is strict. INV_A < INV_B.
const CUSTOMER = 'c0a80121-7ac0-4e1c-9f3b-1a2b3c4d5e6f'
const BATCH_A = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
const INV_A = '2c8e7d10-3f4a-4b5c-8d6e-7f8091a2b3c4'
const INV_B = '5d9f8e21-4a5b-4c6d-9e7f-8091a2b3c4d5'
const INV_MISSING = '8e0a9f32-5b6c-4d7e-af80-91a2b3c4d5e6'
const LOT_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002' // ROA-7742
const LOT_B = 'b4cc29af-9c0a-4999-8a23-bdf5f7654113' // ROA-8895
const ORDER_ID = 'e5dd3ab0-ad1b-4aaa-9b34-cea608765224'
// Users an Admin may name in sellerId (a uuid, like every real user id).
const SELLER = '7f3e2d1c-0b9a-4c8d-9e7f-6a5b4c3d2e1f'
const NOT_A_ROASTER = '3a4b5c6d-7e8f-4a0b-8c1d-2e3f4a5b6c7d'
const UNKNOWN_USER = '9b8a7c6d-5e4f-4321-a0b9-c8d7e6f5a4b3'
const sellerRoaster = { id: SELLER, roles: ['Roaster'], isSuperAdmin: false }

const UPDATED_AT = new Date('2026-09-20T10:00:00.000Z')

const customerRow = {
  id: CUSTOMER,
  name: 'Cafe Doi',
  contactPhone: '081-234-5678',
  address: '12 Nimman Rd, Chiang Mai',
}

const batchRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  roasterId: 'roaster-1',
  roastedWeightKg: 10,
  greenBeanLotId: LOT_A,
  greenBeanLot: { grade: 'Grade A' },
  ...over,
})

// What the sale routes read from a stock row before pricing (saleStockSelect).
const stockRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  roasterId: 'roaster-1',
  greenBeanLotId: id === INV_B ? LOT_B : LOT_A,
  greenBeanLot: { grade: id === INV_B ? 'Grade B' : 'Grade A' },
  ...over,
})

const internalLot = {
  id: LOT_A,
  displayId: 'GBL-2026-7',
  grade: 'Grade A',
  externalSource: null,
  parchmentLot: {
    processType: 'Washed',
    externalSource: null,
    harvestLot: { cherryVariety: 'Typica' },
  },
}

const externalLot = {
  id: LOT_B,
  displayId: 'GBL-2026-9',
  grade: 'Grade B',
  externalSource: { variety: ' Geisha ', processType: 'Natural' },
  parchmentLot: null,
}

// A stock row as a sale line includes it (greenStockSelect).
const greenStockRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  roasterId: 'roaster-1',
  remainingWeightKg: 7,
  greenBeanLotId: id === INV_B ? LOT_B : LOT_A,
  greenBeanLot: id === INV_B ? externalLot : internalLot,
  ...over,
})

const greenItem = (over: Record<string, unknown> = {}) => ({
  id: 'item-g1',
  saleOrderId: ORDER_ID,
  roastBatchId: null,
  roasterInventoryId: INV_A,
  greenBeanLotId: LOT_A,
  lotGrade: 'Grade A',
  quantity: 5,
  pricePerKg: 320,
  subtotal: 1600,
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  roastBatch: null,
  roasterInventory: greenStockRow(INV_A),
  ...over,
})

const orderRow = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  orderNumber: 'ORD-2026-0001',
  customerId: CUSTOMER,
  customerName: 'Cafe Doi',
  customerPhone: '081-234-5678',
  customerAddress: '12 Nimman Rd, Chiang Mai',
  orderDate: new Date('2026-09-20T12:00:00.000Z'),
  status: 'Confirmed',
  totalAmount: 1600,
  currency: 'THB',
  notes: null,
  createdBy: 'roaster-1',
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  updatedAt: UPDATED_AT,
  customer: null,
  creator: { id: 'roaster-1', name: 'Roaster One' },
  _count: { invoices: 0 },
  items: [greenItem()],
  ...over,
})

// What PUT / DELETE read before they change a sale.
let existingSale: any

const greenLine = (roasterInventoryId: string, quantity: number, pricePerKg = 320) => ({
  roasterInventoryId,
  quantity,
  pricePerKg,
})
const roastLine = (roastBatchId: string, quantity: number, pricePerKg = 900) => ({
  roastBatchId,
  quantity,
  pricePerKg,
})

const saleBody = (over: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER,
  items: [greenLine(INV_A, 2.5)],
  ...over,
})

const jsonRequest = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body) })

const postRequest = (body: unknown) => jsonRequest('http://localhost:3001/api/sale-orders', 'POST', body)
const putRequest = (body: unknown) =>
  jsonRequest(`http://localhost:3001/api/sale-orders/${ORDER_ID}`, 'PUT', body)
const deleteRequest = () =>
  new NextRequest(`http://localhost:3001/api/sale-orders/${ORDER_ID}`, { method: 'DELETE' })
const routeParams = { params: Promise.resolve({ id: ORDER_ID }) }

const sellableRequest = (query = '') =>
  new NextRequest(`http://localhost:3001/api/roaster-inventory/sellable${query}`)
const inventoryPut = (body: unknown) =>
  jsonRequest(`http://localhost:3001/api/roaster-inventory/${INV_A}`, 'PUT', body)
const inventoryParams = { params: Promise.resolve({ id: INV_A }) }

/** [sql with ? for each value, values] for each $executeRaw call. */
const rawCalls = () =>
  mockTx.$executeRaw.mock.calls.map((call: any[]) => ({
    sql: (call[0] as string[]).join('?'),
    values: call.slice(1),
  }))
const inventoryRawCalls = () => rawCalls().filter((c: any) => c.sql.includes('"RoasterInventoryItem"'))
const GREEN_TAKE_SQL = 'GREATEST(0, ROUND(("remainingWeightKg" - ?::double precision)'
const GREEN_RELEASE_SQL = 'ROUND(("remainingWeightKg" + ?::double precision)'
const RESERVE_SQL = '"soldWeightKg" + ?::double precision <= "roastedWeightKg"'

const txInventoryCalls = () =>
  mockTx.roasterInventoryItem.findUnique.mock.calls.length +
  mockTx.roasterInventoryItem.findMany.mock.calls.length +
  mockTx.roasterInventoryItem.update.mock.calls.length

describe('green bean sales', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    existingSale = {
      id: ORDER_ID,
      createdBy: 'roaster-1',
      status: 'Confirmed',
      updatedAt: UPDATED_AT,
      customerId: CUSTOMER,
      items: [{ roastBatchId: null, roasterInventoryId: INV_A, quantity: 2 }],
    }

    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockTx))
    mockPrisma.customer.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === CUSTOMER ? customerRow : null,
    )
    mockPrisma.roastBatch.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.filter((id: string) => id === BATCH_A).map((id: string) => batchRow(id)),
    )
    mockPrisma.roasterInventoryItem.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.filter((id: string) => [INV_A, INV_B].includes(id)).map((id: string) => stockRow(id)),
    )
    mockPrisma.roasterInventoryItem.findUnique.mockResolvedValue({ roasterId: 'roaster-1' })
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === SELLER ? { roles: ['Roaster'] } : where.id === NOT_A_ROASTER ? { roles: ['Processor'] } : null,
    )
    mockPrisma.saleOrder.findMany.mockResolvedValue([orderRow()])
    mockPrisma.saleOrder.findUnique.mockImplementation(async ({ include }: any) =>
      include ? orderRow() : existingSale,
    )

    mockTx.saleOrder.create.mockResolvedValue({ id: ORDER_ID })
    mockTx.saleOrder.updateMany.mockResolvedValue({ count: 1 })
    mockTx.saleOrder.deleteMany.mockResolvedValue({ count: 1 })
    mockTx.saleOrder.findUnique.mockResolvedValue(orderRow())
    mockTx.saleOrderItem.createMany.mockResolvedValue({ count: 1 })
    mockTx.saleOrderItem.deleteMany.mockResolvedValue({ count: 1 })
    mockTx.saleOrderItem.aggregate.mockResolvedValue({ _sum: { quantity: null } })
    mockTx.invoice.deleteMany.mockResolvedValue({ count: 0 })
    mockTx.roastBatch.findUnique.mockResolvedValue({ roastedWeightKg: 10, soldWeightKg: 0 })
    mockTx.roastBatch.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.map((id: string) => ({ id, roastedWeightKg: 10, soldWeightKg: 2.5 })),
    )
    mockTx.roasterInventoryItem.findUnique.mockResolvedValue({
      roasterId: 'roaster-1',
      remainingWeightKg: 1.5,
      greenBeanLotId: LOT_A,
    })
    // Newest first on purpose: the response must come back sorted by id.
    mockTx.roasterInventoryItem.findMany.mockImplementation(async ({ where }: any) =>
      [...where.id.in].reverse().map((id: string) => ({ id, remainingWeightKg: id === INV_B ? 3 : 7 })),
    )
    mockTx.roasterInventoryItem.update.mockResolvedValue({ id: INV_A, claimedWeightKg: 12, remainingWeightKg: 8 })
    mockTx.$executeRaw.mockResolvedValue(1)
    mockTx.$queryRaw.mockResolvedValue([{ id: INV_A }])
  })

  describe('POST /api/sale-orders', () => {
    test.each([
      [
        'a line with neither a roast nor a stock row',
        saleBody({ items: [{ quantity: 1, pricePerKg: 100 }] }),
        'Line 1: Choose roasted coffee or green beans',
      ],
      [
        'a line with both',
        saleBody({ items: [{ roastBatchId: BATCH_A, roasterInventoryId: INV_A, quantity: 1, pricePerKg: 100 }] }),
        'Line 1: A line is either roasted coffee or green beans, not both',
      ],
      [
        'a stock row id that is not a uuid',
        saleBody({ items: [greenLine('inv-1', 1)] }),
        'Line 1: Choose roasted coffee or green beans',
      ],
      [
        'both ids null',
        saleBody({ items: [{ roastBatchId: null, roasterInventoryId: null, quantity: 1, pricePerKg: 100 }] }),
        'Line 1: Choose roasted coffee or green beans',
      ],
      ['no lines', saleBody({ items: [] }), 'Add at least one line to the sale'],
      ['lines that are not a list', saleBody({ items: 'x' }), 'Add at least one line to the sale'],
      [
        'the same stock row twice',
        saleBody({ items: [greenLine(INV_A, 1), greenLine(INV_A, 2)] }),
        'Each green bean lot can appear only once in a sale',
      ],
    ])('400 for %s', async (_name, body, message) => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(body))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe(message)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('accepts an explicit null roastBatchId next to a stock row', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(saleBody({ items: [{ roastBatchId: null, roasterInventoryId: INV_A, quantity: 1, pricePerKg: 100 }] })),
      )
      expect(response.status).toBe(201)
      expect(mockPrisma.roastBatch.findMany).not.toHaveBeenCalled()
    })

    test('404 for a stock row that no longer exists, with no transaction', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ items: [greenLine(INV_A, 1), greenLine(INV_MISSING, 1)] })))
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe(
        'One of the green bean lots on this sale is no longer in your stock. Reload and try again.',
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test.each([
      ['a roaster', otherRoaster],
      ['an Admin', admin],
    ])("403 when %s sells another roaster's stock", async (_who, user) => {
      mockAuthUser = user
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('You can only sell green beans from your own stock.')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('prices the line on the server from the stock row and ignores client amounts', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(
          saleBody({
            totalAmount: 1,
            items: [{ ...greenLine(INV_A, 1.23456, 99.999), subtotal: 999, greenBeanLotId: LOT_B, lotGrade: 'Fake' }],
          }),
        ),
      )
      expect(response.status).toBe(201)
      const rows = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        roastBatchId: null,
        roasterInventoryId: INV_A,
        greenBeanLotId: LOT_A,
        lotGrade: 'Grade A',
        quantity: 1.235,
        pricePerKg: 100,
        subtotal: 123.5,
        saleOrderId: ORDER_ID,
      })
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.totalAmount).toBe(123.5)
      // The stock SQL takes the rounded kg too.
      expect(inventoryRawCalls()[0].values[0]).toBe(1.235)
    })

    test('the grade snapshot is cut to 50 characters', async () => {
      mockAuthUser = roaster
      mockPrisma.roasterInventoryItem.findMany.mockResolvedValueOnce([
        stockRow(INV_A, { greenBeanLot: { grade: 'G'.repeat(80) } }),
      ])
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(201)
      expect(mockTx.saleOrderItem.createMany.mock.calls[0][0].data[0].lotGrade).toBe('G'.repeat(50))
    })

    test('takes the green kg with one guarded UPDATE inside the transaction', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(201)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 15000 })

      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[0].sql).toContain('"roasterId" = ?')
      expect(calls[0].values).toEqual([2.5, INV_A, 'roaster-1', 2.5, 1e-6])
      // Raw SQL only: a Prisma update would bump updatedAt and the global stamp.
      expect(mockTx.roasterInventoryItem.update).not.toHaveBeenCalled()

      // After the sale and its lines exist, before the read-back.
      const take = mockTx.$executeRaw.mock.invocationCallOrder[0]
      expect(take).toBeGreaterThan(mockTx.saleOrder.create.mock.invocationCallOrder[0])
      expect(take).toBeGreaterThan(mockTx.saleOrderItem.createMany.mock.invocationCallOrder[0])
      expect(take).toBeLessThan(mockTx.saleOrder.findUnique.mock.invocationCallOrder[0])
    })

    test('a mixed sale reserves the roasts first, then takes stock rows in id order', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(saleBody({ items: [greenLine(INV_B, 1.5), roastLine(BATCH_A, 2.5), greenLine(INV_A, 2)] })),
      )
      expect(response.status).toBe(201)

      const calls = rawCalls()
      expect(calls).toHaveLength(3)
      expect(calls[0].sql).toContain('"RoastBatch"')
      expect(calls[0].sql).toContain(RESERVE_SQL)
      expect(calls[0].values.slice(0, 2)).toEqual([2.5, BATCH_A])
      expect(calls[1].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[1].values.slice(0, 3)).toEqual([2, INV_A, 'roaster-1'])
      expect(calls[2].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[2].values.slice(0, 3)).toEqual([1.5, INV_B, 'roaster-1'])

      const rows = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(rows.map((r: any) => [r.roastBatchId, r.roasterInventoryId, r.greenBeanLotId])).toEqual([
        [null, INV_B, LOT_B],
        [BATCH_A, null, LOT_A],
        [null, INV_A, LOT_A],
      ])
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.totalAmount).toBe(3370)

      const body = await response.json()
      expect(body.message).toBe('Sale recorded')
      expect(body.affectedRoastBatches).toEqual([{ id: BATCH_A, soldWeightKg: 2.5, availableKg: 7.5 }])
      expect(body.affectedInventoryItems).toEqual([
        { id: INV_A, remainingWeightKg: 7 },
        { id: INV_B, remainingWeightKg: 3 },
      ])
    })

    test('a Draft sale holds its green kg too', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ status: 'Draft' })))
      expect(response.status).toBe(201)
      expect(inventoryRawCalls()).toHaveLength(1)
      expect(inventoryRawCalls()[0].sql).toContain(GREEN_TAKE_SQL)
    })

    test('409 naming the lot and the free kg when the green beans are gone', async () => {
      mockAuthUser = roaster
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ items: [greenLine(INV_A, 2)] })))
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: `Not enough green beans left in ${roaLabel(LOT_A)}: at most 1.5 kg can go on this sale, 2 kg asked.`,
        roasterInventoryId: INV_A,
        maxKg: 1.5,
      })
      expect(roaLabel(LOT_A)).toBe('ROA-7742')
      // Thrown inside the transaction, so nothing is read back or kept.
      expect(mockTx.saleOrder.findUnique).not.toHaveBeenCalled()
    })

    test('a roast-only sale never touches the stock rows', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ items: [roastLine(BATCH_A, 2)] })))
      expect(response.status).toBe(201)
      expect(mockPrisma.roasterInventoryItem.findMany).not.toHaveBeenCalled()
      expect(inventoryRawCalls()).toHaveLength(0)
      expect(txInventoryCalls()).toBe(0)
      expect((await response.json()).affectedInventoryItems).toEqual([])
    })
  })

  describe('PUT /api/sale-orders/[id]', () => {
    test('cancelling returns the green kg and takes nothing', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Cancelled' }), routeParams)
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(GREEN_RELEASE_SQL)
      expect(calls[0].sql).not.toContain(GREEN_TAKE_SQL)
      expect(calls[0].values).toEqual([2, INV_A])
      const body = await response.json()
      expect(body.message).toBe('Sale updated')
      expect(body.affectedRoastBatches).toEqual([])
      expect(body.affectedInventoryItems).toEqual([{ id: INV_A, remainingWeightKg: 7 }])
    })

    test('un-cancelling takes the kg again', async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Confirmed' }), routeParams)
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[0].values).toEqual([2, INV_A, 'roaster-1', 2, 1e-6])
    })

    test('409 when un-cancelling and the green beans are gone; the max is the free kg', async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Confirmed' }), routeParams)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.maxKg).toBe(1.5)
      expect(body.roasterInventoryId).toBe(INV_A)
      expect(body.error).toContain('at most 1.5 kg')
      expect(body.error).toContain('2 kg asked')
    })

    test('a line edit takes only the difference', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [greenLine(INV_A, 3.5)] }), routeParams)
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[0].values).toEqual([1.5, INV_A, 'roaster-1', 1.5, 1e-6])
    })

    test('409 when a line grows past the free kg; the max adds back what the sale holds', async () => {
      mockAuthUser = roaster
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      mockTx.roasterInventoryItem.findUnique.mockResolvedValueOnce({
        roasterId: 'roaster-1',
        remainingWeightKg: 1,
        greenBeanLotId: LOT_A,
      })
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [greenLine(INV_A, 3.5)] }), routeParams)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.maxKg).toBe(3)
      expect(body.error).toBe(
        `Not enough green beans left in ${roaLabel(LOT_A)}: at most 3 kg can go on this sale, 3.5 kg asked.`,
      )
    })

    test('a sale with green lines is not refused as an older sale: its lines can be edited', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [greenLine(INV_A, 2, 350)] }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.saleOrderItem.deleteMany).toHaveBeenCalledWith({ where: { saleOrderId: ORDER_ID } })
      const rows = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(rows[0]).toMatchObject({ roastBatchId: null, roasterInventoryId: INV_A, quantity: 2, pricePerKg: 350 })
      expect(mockTx.saleOrder.updateMany.mock.calls[0][0].data.totalAmount).toBe(700)
      // Same kg: nothing moves.
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
    })

    test('lines with neither a roast nor a stock row still cannot be edited', async () => {
      mockAuthUser = roaster
      existingSale.items = [{ roastBatchId: null, roasterInventoryId: null, quantity: 20 }]
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [greenLine(INV_A, 1)] }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain('recorded before roast sales')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('switching a line from green beans to a roast reserves the roast, then returns the green kg', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [roastLine(BATCH_A, 2)] }), routeParams)
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(2)
      expect(calls[0].sql).toContain(RESERVE_SQL)
      expect(calls[0].values.slice(0, 2)).toEqual([2, BATCH_A])
      expect(calls[1].sql).toContain(GREEN_RELEASE_SQL)
      expect(calls[1].values).toEqual([2, INV_A])
      const body = await response.json()
      expect(body.affectedRoastBatches).toHaveLength(1)
      expect(body.affectedInventoryItems).toEqual([{ id: INV_A, remainingWeightKg: 7 }])
    })

    test("403 when an Admin puts stock that is not the owner's on a roaster's sale", async () => {
      mockAuthUser = admin
      mockPrisma.roasterInventoryItem.findMany.mockResolvedValueOnce([
        stockRow(INV_A),
        stockRow(INV_B, { roasterId: 'admin-1' }),
      ])
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [greenLine(INV_A, 2), greenLine(INV_B, 1)] }), routeParams)
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe(
        'Every green bean lot on a sale must come from the stock of the roaster who recorded the sale.',
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test("an Admin's edit takes the kg from the owner's stock", async () => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [greenLine(INV_A, 3)] }), routeParams)
      expect(response.status).toBe(200)
      expect(rawCalls()[0].values.slice(0, 3)).toEqual([1, INV_A, 'roaster-1'])
    })

    test('a notes-only edit moves no green kg', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ notes: 'Paid' }), routeParams)
      expect(response.status).toBe(200)
      expect(inventoryRawCalls()).toHaveLength(0)
      expect(mockPrisma.roasterInventoryItem.findMany).not.toHaveBeenCalled()
      expect(txInventoryCalls()).toBe(0)
      expect((await response.json()).affectedInventoryItems).toEqual([])
    })
  })

  describe('DELETE /api/sale-orders/[id]', () => {
    test('a live sale returns its green kg to the stock row', async () => {
      mockAuthUser = roaster
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        message: 'Sale deleted',
        affectedRoastBatches: [],
        affectedInventoryItems: [{ id: INV_A, remainingWeightKg: 7 }],
        deletedInvoices: 0,
      })
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(GREEN_RELEASE_SQL)
      expect(calls[0].values).toEqual([2, INV_A])
      expect(mockTx.$executeRaw.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockTx.saleOrder.deleteMany.mock.invocationCallOrder[0],
      )
    })

    test('a mixed sale returns the roast kg first, then the green kg (same lock order as POST)', async () => {
      mockAuthUser = roaster
      existingSale.items = [
        { roastBatchId: null, roasterInventoryId: INV_A, quantity: 2 },
        { roastBatchId: BATCH_A, roasterInventoryId: null, quantity: 2 },
      ]
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)

      const calls = rawCalls()
      expect(calls).toHaveLength(2)
      expect(calls[0].sql).toContain('"RoastBatch"')
      expect(calls[0].sql).toContain('GREATEST(0, ROUND(("soldWeightKg" - ?::double precision)')
      expect(calls[0].values).toEqual([2, BATCH_A])
      expect(calls[1].sql).toContain(GREEN_RELEASE_SQL)
      expect(calls[1].values).toEqual([2, INV_A])

      const body = await response.json()
      expect(body.affectedRoastBatches).toEqual([{ id: BATCH_A, soldWeightKg: 2.5, availableKg: 7.5 }])
      expect(body.affectedInventoryItems).toEqual([{ id: INV_A, remainingWeightKg: 7 }])
    })

    test('a cancelled sale returns nothing', async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
      expect(txInventoryCalls()).toBe(0)
      expect((await response.json()).affectedInventoryItems).toEqual([])
    })
  })

  describe('an Admin selling for a roaster (sellerId)', () => {
    // The roasts and stock rows the sale routes read, owned by SELLER unless
    // `owners` names someone else.
    const ownedBy = (owners: Record<string, string> = {}) => {
      mockPrisma.roasterInventoryItem.findMany.mockImplementation(async ({ where }: any) =>
        where.id.in
          .filter((id: string) => [INV_A, INV_B].includes(id))
          .map((id: string) => stockRow(id, { roasterId: owners[id] ?? SELLER })),
      )
      mockPrisma.roastBatch.findMany.mockImplementation(async ({ where }: any) =>
        where.id.in
          .filter((id: string) => id === BATCH_A)
          .map((id: string) => batchRow(id, { roasterId: owners[id] ?? SELLER })),
      )
    }

    test.each([
      ['an Admin', admin],
      ['a super admin', superAdmin],
    ])("%s records the sale as the roaster's, from the roaster's roasts and stock", async (_who, user) => {
      mockAuthUser = user
      ownedBy()
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(saleBody({ sellerId: SELLER, items: [roastLine(BATCH_A, 2.5), greenLine(INV_A, 2)] })),
      )
      expect(response.status).toBe(201)
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: SELLER }, select: { roles: true } })

      const header = mockTx.saleOrder.create.mock.calls[0][0].data
      expect(header.createdBy).toBe(SELLER)
      expect(header).not.toHaveProperty('sellerId')

      const calls = rawCalls()
      expect(calls).toHaveLength(2)
      expect(calls[0].sql).toContain(RESERVE_SQL)
      expect(calls[0].values.slice(0, 2)).toEqual([2.5, BATCH_A])
      // The take's WHERE checks the roaster's id, not the Admin's.
      expect(calls[1].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[1].values).toEqual([2, INV_A, SELLER, 2, 1e-6])
    })

    test.each([
      ['a user who is not a roaster', NOT_A_ROASTER],
      ['a user who does not exist', UNKNOWN_USER],
    ])('400 when an Admin names %s, before reading any stock', async (_name, sellerId) => {
      mockAuthUser = admin
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ sellerId })))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Choose a roaster to sell for')
      expect(mockPrisma.roasterInventoryItem.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('400 for a sellerId that is not a uuid, without a user lookup', async () => {
      mockAuthUser = admin
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ sellerId: 'roaster-1' })))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Choose a roaster to sell for')
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    })

    test('403 when a roaster names another roaster, before any lookup', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ sellerId: SELLER })))
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('Only an admin can record a sale for another roaster')
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.customer.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('a roaster naming themselves is the same as naming no one', async () => {
      mockAuthUser = sellerRoaster
      ownedBy()
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ sellerId: SELLER })))
      expect(response.status).toBe(201)
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.createdBy).toBe(SELLER)
      expect(inventoryRawCalls()[0].values).toEqual([2.5, INV_A, SELLER, 2.5, 1e-6])
    })

    test.each([
      [
        "green beans from another roaster's stock",
        { [INV_B]: 'roaster-2' },
        [greenLine(INV_A, 1), greenLine(INV_B, 1)],
        'Every green bean lot on a sale must come from the stock of the roaster who is selling.',
      ],
      [
        "the Admin's own green beans",
        { [INV_B]: 'admin-1' },
        [greenLine(INV_A, 1), greenLine(INV_B, 1)],
        'Every green bean lot on a sale must come from the stock of the roaster who is selling.',
      ],
      [
        'a roast from another roaster',
        { [BATCH_A]: 'roaster-2' },
        [roastLine(BATCH_A, 1), greenLine(INV_A, 1)],
        'Every roast on a sale must come from the roaster who is selling.',
      ],
    ])('403 when an Admin selling for a roaster adds %s', async (_name, owners, items, message) => {
      mockAuthUser = admin
      ownedBy(owners)
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ sellerId: SELLER, items })))
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe(message)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('an Admin with no sellerId (or null) still sells their own stock in their own name', async () => {
      mockAuthUser = admin
      ownedBy({ [INV_A]: 'admin-1' })
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ sellerId: null })))
      expect(response.status).toBe(201)
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.createdBy).toBe('admin-1')
      expect(inventoryRawCalls()[0].values).toEqual([2.5, INV_A, 'admin-1', 2.5, 1e-6])
    })

    test("an Admin's edit of a roaster's sale moves the roaster's stock; a sellerId is ignored", async () => {
      mockAuthUser = admin
      existingSale.createdBy = SELLER
      ownedBy()
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(
        putRequest({ sellerId: UNKNOWN_USER, items: [greenLine(INV_A, 3)] }),
        routeParams,
      )
      expect(response.status).toBe(200)
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
      const header = mockTx.saleOrder.updateMany.mock.calls[0][0].data
      expect(header).not.toHaveProperty('createdBy')
      expect(header).not.toHaveProperty('sellerId')
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(GREEN_TAKE_SQL)
      expect(calls[0].values).toEqual([1, INV_A, SELLER, 1, 1e-6])
    })

    test('a PUT with only a sellerId has nothing to update', async () => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ sellerId: SELLER }), routeParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Nothing to update')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test("an Admin cancelling a roaster's sale returns the kg to the roaster's stock row", async () => {
      mockAuthUser = admin
      existingSale.createdBy = SELLER
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Cancelled' }), routeParams)
      expect(response.status).toBe(200)
      expect(rawCalls()).toEqual([{ sql: expect.stringContaining(GREEN_RELEASE_SQL), values: [2, INV_A] }])
    })

    test("an Admin's delete of a roaster's sale returns the kg to the roaster's stock row", async () => {
      mockAuthUser = admin
      existingSale.createdBy = SELLER
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)
      expect(rawCalls()).toEqual([{ sql: expect.stringContaining(GREEN_RELEASE_SQL), values: [2, INV_A] }])
      expect((await response.json()).affectedInventoryItems).toEqual([{ id: INV_A, remainingWeightKg: 7 }])
    })

    test('the roaster owns a sale an Admin recorded for them: they may edit it, another roaster may not', async () => {
      existingSale.createdBy = SELLER
      ownedBy()
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')

      mockAuthUser = otherRoaster
      const forbidden = await PUT(putRequest({ items: [greenLine(INV_A, 3)] }), routeParams)
      expect(forbidden.status).toBe(403)

      mockAuthUser = sellerRoaster
      const allowed = await PUT(putRequest({ items: [greenLine(INV_A, 3)] }), routeParams)
      expect(allowed.status).toBe(200)
      expect(rawCalls()[0].values).toEqual([1, INV_A, SELLER, 1, 1e-6])
    })
  })

  describe('GET sale JSON', () => {
    test('a green line serializes with roast null and a green summary', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.findUnique.mockResolvedValueOnce(
        orderRow({
          items: [
            greenItem(),
            greenItem({
              id: 'item-g2',
              roasterInventoryId: INV_B,
              greenBeanLotId: LOT_B,
              lotGrade: 'Grade B',
              roasterInventory: greenStockRow(INV_B, { remainingWeightKg: 0.19999999999999998 }),
            }),
          ],
        }),
      )
      const { GET } = await import('@/app/api/sale-orders/[id]/route')
      const response = await GET(new NextRequest(`http://localhost/api/sale-orders/${ORDER_ID}`), routeParams)
      expect(response.status).toBe(200)
      const { saleOrder } = await response.json()

      expect(saleOrder.items[0]).toMatchObject({ roastBatchId: null, roasterInventoryId: INV_A, roast: null })
      expect(saleOrder.items[0].green).toEqual({
        id: INV_A,
        label: roaLabel(LOT_A),
        greenBeanLotId: LOT_A,
        greenBeanLotDisplayId: 'GBL-2026-7',
        grade: 'Grade A',
        variety: 'Typica',
        process: 'Washed',
        availableKg: 7,
      })
      // An external lot's own facts win.
      expect(saleOrder.items[1].green).toEqual({
        id: INV_B,
        label: 'ROA-8895',
        greenBeanLotId: LOT_B,
        greenBeanLotDisplayId: 'GBL-2026-9',
        grade: 'Grade B',
        variety: 'Geisha',
        process: 'Natural',
        availableKg: 0.2,
      })
    })

    test('the sales log serializes green lines too', async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(new NextRequest('http://localhost/api/sale-orders'))
      const [order] = (await response.json()).saleOrders
      expect(order.items[0].green).toMatchObject({ id: INV_A, label: 'ROA-7742' })
      expect(order.items[0].roast).toBeNull()
    })
  })

  describe('GET /api/roaster-inventory/sellable', () => {
    test("a roaster's ?roasterId is ignored; an Admin's is honoured", async () => {
      mockPrisma.roasterInventoryItem.findMany.mockResolvedValue([])
      const { GET } = await import('@/app/api/roaster-inventory/sellable/route')

      mockAuthUser = roaster
      expect((await GET(sellableRequest('?roasterId=roaster-2'))).status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.findMany.mock.calls[0][0].where.roasterId).toBe('roaster-1')

      mockAuthUser = admin
      expect((await GET(sellableRequest('?roasterId=roaster-2'))).status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.findMany.mock.calls[1][0].where.roasterId).toBe('roaster-2')

      expect((await GET(sellableRequest())).status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.findMany.mock.calls[2][0].where.roasterId).toBe('admin-1')
    })

    test('lists rows with more than 10 g left, kg rounded down to the gram', async () => {
      mockAuthUser = roaster
      mockPrisma.roasterInventoryItem.findMany.mockResolvedValueOnce([
        greenStockRow(INV_A, { remainingWeightKg: 8.4567 }),
        greenStockRow(INV_B, { remainingWeightKg: 0.19999999999999998 }),
      ])
      const { GET } = await import('@/app/api/roaster-inventory/sellable/route')
      const response = await GET(sellableRequest())
      expect(response.status).toBe(200)

      const args = mockPrisma.roasterInventoryItem.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ roasterId: 'roaster-1', remainingWeightKg: { gt: 0.01 } })
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }])

      const { greenLots } = await response.json()
      expect(greenLots).toEqual([
        {
          id: INV_A,
          label: 'ROA-7742',
          greenBeanLotId: LOT_A,
          greenBeanLotDisplayId: 'GBL-2026-7',
          grade: 'Grade A',
          variety: 'Typica',
          process: 'Washed',
          availableKg: 8.456,
          roasterId: 'roaster-1',
        },
        expect.objectContaining({ id: INV_B, availableKg: 0.2, roasterId: 'roaster-1' }),
      ])
    })

    test('403 for a Processor, with no query', async () => {
      mockAuthUser = processor
      const { GET } = await import('@/app/api/roaster-inventory/sellable/route')
      const response = await GET(sellableRequest())
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('Forbidden')
      expect(mockPrisma.roasterInventoryItem.findMany).not.toHaveBeenCalled()
    })
  })

  describe('PUT /api/roaster-inventory/[id]', () => {
    const withStock = (held: number | null, claimed = 12, remaining = 8) => {
      mockTx.saleOrderItem.aggregate.mockResolvedValue({ _sum: { quantity: held } })
      mockTx.roasterInventoryItem.findUnique.mockResolvedValue({ claimedWeightKg: claimed, remainingWeightKg: remaining })
    }

    test('locks the row, then sums the kg live sales hold, inside the transaction', async () => {
      mockAuthUser = roaster
      withStock(4)
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ remainingWeightKg: 8 }), inventoryParams)
      expect(response.status).toBe(200)

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 15000 })
      const [strings, ...values] = mockTx.$queryRaw.mock.calls[0]
      expect((strings as string[]).join('?')).toContain('FOR NO KEY UPDATE')
      expect(values).toEqual([INV_A])
      expect(mockTx.saleOrderItem.aggregate).toHaveBeenCalledWith({
        where: { roasterInventoryId: INV_A, saleOrder: { status: { not: 'Cancelled' } } },
        _sum: { quantity: true },
      })

      const lock = mockTx.$queryRaw.mock.invocationCallOrder[0]
      const sum = mockTx.saleOrderItem.aggregate.mock.invocationCallOrder[0]
      const write = mockTx.roasterInventoryItem.update.mock.invocationCallOrder[0]
      expect(lock).toBeLessThan(sum)
      expect(sum).toBeLessThan(write)
      expect(mockTx.roasterInventoryItem.update.mock.calls[0][0]).toMatchObject({
        where: { id: INV_A },
        data: { remainingWeightKg: 8 },
      })
      expect((await response.json()).inventoryItem).toMatchObject({ id: INV_A })
    })

    test('409 when remaining plus what sales hold would pass the claimed kg', async () => {
      mockAuthUser = roaster
      withStock(4)
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ remainingWeightKg: 9 }), inventoryParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Remaining weight can be at most 8 kg because sales hold 4 kg of this lot.',
      )
      expect(mockTx.roasterInventoryItem.update).not.toHaveBeenCalled()
    })

    test('409 when lowering claimed would leave too little room for what sales hold', async () => {
      mockAuthUser = roaster
      withStock(4)
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ claimedWeightKg: 10 }), inventoryParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Remaining weight can be at most 6 kg because sales hold 4 kg of this lot.',
      )
    })

    test('409 when claimed would be below what sales hold', async () => {
      mockAuthUser = roaster
      withStock(4)
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ claimedWeightKg: 3 }), inventoryParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Claimed weight cannot be less than the 4 kg that sales hold of this lot.',
      )
      expect(mockTx.roasterInventoryItem.update).not.toHaveBeenCalled()
    })

    test.each([
      ['remaining above claimed', { remainingWeightKg: 13 }],
      ['only claimed lowered below the current remaining', { claimedWeightKg: 5 }],
    ])('400 with no holds for %s', async (_name, body) => {
      mockAuthUser = roaster
      withStock(null)
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut(body), inventoryParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('remainingWeightKg cannot exceed claimedWeightKg')
      expect(mockTx.roasterInventoryItem.update).not.toHaveBeenCalled()
    })

    test('400 for a junk weight, before the transaction', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ remainingWeightKg: 'abc' }), inventoryParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Invalid remainingWeightKg')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('403 for a Processor, without reading the row', async () => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ remainingWeightKg: 1 }), inventoryParams)
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('Forbidden')
      expect(mockPrisma.roasterInventoryItem.findUnique).not.toHaveBeenCalled()
    })

    test("403 Forbidden for another roaster's row; an Admin may edit it", async () => {
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      mockAuthUser = otherRoaster
      const forbidden = await PUT(inventoryPut({ remainingWeightKg: 1 }), inventoryParams)
      expect(forbidden.status).toBe(403)
      expect((await forbidden.json()).error).toBe('Forbidden')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()

      mockAuthUser = admin
      withStock(null)
      const allowed = await PUT(inventoryPut({ remainingWeightKg: 1 }), inventoryParams)
      expect(allowed.status).toBe(200)
    })

    test('404 when the row is missing', async () => {
      mockAuthUser = roaster
      mockPrisma.roasterInventoryItem.findUnique.mockResolvedValueOnce(null)
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(inventoryPut({ remainingWeightKg: 1 }), inventoryParams)
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe('Inventory item not found')
    })
  })

  describe('lib', () => {
    test('reservationsByInventory sums per stock row, skips other lines, and holds nothing when Cancelled', () => {
      const lines = [
        { roasterInventoryId: INV_A, quantity: 0.1 },
        { roasterInventoryId: INV_A, quantity: 0.2 },
        { roasterInventoryId: null, quantity: 5 },
        { roastBatchId: BATCH_A, quantity: 3 },
        { quantity: 1 },
      ]
      expect(Array.from(reservationsByInventory('Confirmed', lines))).toEqual([[INV_A, 0.3]])
      expect(reservationsByInventory('Draft', lines).get(INV_A)).toBe(0.3)
      expect(reservationsByInventory('Cancelled', lines).size).toBe(0)
    })

    test('priceLines prices a mixed sale and totals 0.1 + 0.1 + 0.1 to exactly 0.3', () => {
      const batchById = new Map([[BATCH_A, { id: BATCH_A, greenBeanLotId: LOT_A, greenBeanLot: { grade: 'Grade A' } }]])
      const stockById = new Map([
        [INV_A, { id: INV_A, greenBeanLotId: LOT_A, greenBeanLot: { grade: 'Grade A' } }],
        [INV_B, { id: INV_B, greenBeanLotId: LOT_B, greenBeanLot: { grade: 'Grade B' } }],
      ])
      const { rows, totalAmount } = priceLines(
        [
          { roastBatchId: BATCH_A, quantity: 0.1, pricePerKg: 1 },
          { roasterInventoryId: INV_A, quantity: 0.1, pricePerKg: 1 },
          { roastBatchId: null, roasterInventoryId: INV_B, quantity: 0.1, pricePerKg: 1 },
        ],
        batchById,
        stockById,
      )
      expect(totalAmount).toBe(0.3)
      expect(rows.map((r) => [r.roastBatchId, r.roasterInventoryId, r.greenBeanLotId, r.lotGrade])).toEqual([
        [BATCH_A, null, LOT_A, 'Grade A'],
        [null, INV_A, LOT_A, 'Grade A'],
        [null, INV_B, LOT_B, 'Grade B'],
      ])
      expect(() => priceLines([{ roasterInventoryId: INV_MISSING, quantity: 1, pricePerKg: 1 }], batchById, stockById))
        .toThrow(`Green stock ${INV_MISSING} was not loaded`)
      expect(() => priceLines([{ quantity: 1, pricePerKg: 1 }], batchById, stockById)).toThrow()
    })

    test('applyGreenReservationChange makes no call at all when no kg move', async () => {
      const tx: any = {}
      await expect(
        applyGreenReservationChange(tx, new Map([[INV_A, 2]]), new Map([[INV_A, 2]]), 'roaster-1'),
      ).resolves.toEqual([])
      await expect(applyGreenReservationChange(tx, new Map(), new Map(), 'roaster-1')).resolves.toEqual([])
    })

    test("a take that misses on someone else's row offers only what the sale already held", async () => {
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      mockTx.roasterInventoryItem.findUnique.mockResolvedValueOnce({
        roasterId: 'roaster-2',
        remainingWeightKg: 50,
        greenBeanLotId: LOT_A,
      })
      await expect(
        applyGreenReservationChange(mockTx, new Map([[INV_A, 1]]), new Map([[INV_A, 4]]), 'roaster-1'),
      ).rejects.toMatchObject({ name: 'GreenStockError', roasterInventoryId: INV_A, maxKg: 1, askedKg: 4 })
    })

    test("roaLabel matches the frontend's toRoaId", () => {
      const source = readFileSync(path.join(__dirname, '../../frontend/src/utils/formatters.ts'), 'utf8')
      const fn = source.match(/export function toRoaId\([\s\S]*?\n}/)
      expect(fn).not.toBeNull()
      const js = ts.transpileModule(fn![0].replace(/^export /, ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
      }).outputText
      const toRoaId = new Function(`${js}\nreturn toRoaId`)() as (id: string) => string
      for (const id of [LOT_A, LOT_B, INV_A, BATCH_A, '00000000-0000-4000-8000-000000000000']) {
        expect(roaLabel(id)).toBe(toRoaId(id))
      }
      expect(roaLabel(LOT_A)).toBe('ROA-7742')
    })
  })
})
