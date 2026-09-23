/**
 * /api/sale-orders and /api/sale-orders/[id]
 * Selling roasted coffee from roast batches: validation, ownership, server
 * pricing, and the sold-kg bookkeeping that moves with every sale.
 *
 * Writes live only on `mockTx`, the client the transaction callback gets, so
 * a write that escaped the transaction would hit an undefined function on
 * `mockPrisma` and fail the test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { todayDateOnly } from '@/lib/utils'
import { SALE_CHANGED_MESSAGE, SALE_REF_GONE_MESSAGE } from '@/lib/saleOrders'

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
  },
  invoice: {
    deleteMany: jest.fn(),
  },
  roastBatch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $executeRaw: jest.fn(),
}

const mockPrisma: any = {
  saleOrder: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  customer: {
    findUnique: jest.fn(),
  },
  roastBatch: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(mockTx)),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

const mockNextOrderNumber: any = jest.fn(async () => 'ORD-2026-0001')

jest.mock('@/lib/documentNumbers', () => ({
  getNextSaleOrderNumber: () => mockNextOrderNumber(),
  isUniqueConstraintError: (e: any) => e?.code === 'P2002',
}))

let mockAuthUser: any = null
let mockAuthError: Error | null = null

jest.mock('@/lib/middleware', () => ({
  requireAuth: jest.fn(async () => {
    if (mockAuthError) throw mockAuthError
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
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message === 'Insufficient permissions'
          ? 403
          : error.code === 'P2025'
            ? 404
            : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const otherRoaster = { id: 'roaster-2', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const processor = { id: 'processor-1', roles: ['Processor'], isSuperAdmin: false }
const farmer = { id: 'farmer-1', roles: ['Farmer'], isSuperAdmin: false }

// Real v4 UUIDs: zod's uuid() is strict. Sorted A < B < C.
const CUSTOMER = 'c0a80121-7ac0-4e1c-9f3b-1a2b3c4d5e6f'
const OTHER_CUSTOMER = 'd1b91232-8bd1-4f2d-8a4c-2b3c4d5e6f70'
const BATCH_A = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed' // RB-1581
const BATCH_B = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b' // RB-5183
const BATCH_C = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f'
const LOT_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
const LOT_B = 'b4cc29af-9c0a-4999-8a23-bdf5f7654113'
const ORDER_ID = 'e5dd3ab0-ad1b-4aaa-9b34-cea608765224'

const UPDATED_AT = new Date('2026-09-20T10:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

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
  greenBeanLotId: id === BATCH_B ? LOT_B : LOT_A,
  greenBeanLot: { grade: id === BATCH_B ? 'Grade B' : 'Grade A' },
  ...over,
})

const roastSummaryRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  roasterId: 'roaster-1',
  roastDate: new Date('2026-09-18T12:00:00.000Z'),
  roastLevel: 'Medium',
  roastedWeightKg: 10,
  soldWeightKg: 2.5,
  greenBeanLotId: LOT_A,
  greenBeanLot: {
    id: LOT_A,
    displayId: 'GB-2026-3',
    grade: 'Grade A',
    externalSource: null,
    parchmentLot: {
      processType: 'Washed',
      externalSource: null,
      harvestLot: { cherryVariety: 'Catimor' },
    },
  },
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
  totalAmount: 950,
  currency: 'THB',
  notes: null,
  createdBy: 'roaster-1',
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  updatedAt: UPDATED_AT,
  customer: {
    id: CUSTOMER,
    name: 'Cafe Doi (renamed)',
    type: 'Retailer',
    contactEmail: null,
    contactPhone: '099-999-9999',
    address: null,
  },
  creator: { id: 'roaster-1', name: 'Roaster One' },
  _count: { invoices: 2 },
  items: [
    {
      id: 'item-1',
      saleOrderId: ORDER_ID,
      roastBatchId: BATCH_A,
      greenBeanLotId: LOT_A,
      lotGrade: 'Grade A',
      quantity: 2.5,
      pricePerKg: 380,
      subtotal: 950,
      createdAt: new Date('2026-09-20T09:00:00.000Z'),
      roastBatch: roastSummaryRow(BATCH_A),
    },
  ],
  ...over,
})

// What PUT / DELETE read before they change a sale.
let existingSale: any

const line = (roastBatchId: string, quantity: number, pricePerKg = 380) => ({
  roastBatchId,
  quantity,
  pricePerKg,
})

const saleBody = (over: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER,
  items: [line(BATCH_A, 2.5)],
  ...over,
})

const jsonRequest = (url: string, method: string, body: unknown) =>
  new NextRequest(url, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const postRequest = (body: unknown) => jsonRequest('http://localhost:3001/api/sale-orders', 'POST', body)
const putRequest = (body: unknown) =>
  jsonRequest(`http://localhost:3001/api/sale-orders/${ORDER_ID}`, 'PUT', body)
const deleteRequest = (query = '') =>
  new NextRequest(`http://localhost:3001/api/sale-orders/${ORDER_ID}${query}`, { method: 'DELETE' })
const getListRequest = (query = '') => new NextRequest(`http://localhost:3001/api/sale-orders${query}`)
const routeParams = { params: Promise.resolve({ id: ORDER_ID }) }

const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

/** [sql with ? for each value, values] for each $executeRaw call. */
const rawCalls = () =>
  mockTx.$executeRaw.mock.calls.map((call: any[]) => ({
    sql: (call[0] as string[]).join('?'),
    values: call.slice(1),
  }))
const RESERVE_SQL = '"soldWeightKg" + ?::double precision <= "roastedWeightKg"'
const RELEASE_SQL = 'GREATEST(0, ROUND(("soldWeightKg" - ?::double precision)'

describe('roasted coffee sales', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockAuthError = null
    existingSale = {
      id: ORDER_ID,
      createdBy: 'roaster-1',
      status: 'Confirmed',
      updatedAt: UPDATED_AT,
      customerId: CUSTOMER,
      items: [{ roastBatchId: BATCH_A, quantity: 2 }],
    }

    mockNextOrderNumber.mockResolvedValue('ORD-2026-0001')
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockTx))
    mockPrisma.customer.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === CUSTOMER ? customerRow : null,
    )
    mockPrisma.roastBatch.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.filter((id: string) => [BATCH_A, BATCH_B, BATCH_C].includes(id)).map((id: string) => batchRow(id)),
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
    mockTx.invoice.deleteMany.mockResolvedValue({ count: 0 })
    mockTx.roastBatch.findUnique.mockResolvedValue({ roastedWeightKg: 10, soldWeightKg: 0 })
    mockTx.roastBatch.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.map((id: string) => ({ id, roastedWeightKg: 10, soldWeightKg: 2.5 })),
    )
    mockTx.$executeRaw.mockResolvedValue(1)
  })

  describe('POST /api/sale-orders', () => {
    test('401 when not signed in', async () => {
      mockAuthError = new Error('Unauthorized')
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(401)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test.each([
      ['Processor', processor],
      ['Farmer', farmer],
    ])('403 for a %s', async (_role, user) => {
      mockAuthUser = user
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    const future = () => dateOnly(new Date(todayDateOnly().getTime() + 2 * DAY_MS))

    test.each([
      ['invalid JSON', '{bad json', 'Invalid JSON body'],
      ['a JSON array', '[]', 'Invalid JSON body'],
      ['no lines', saleBody({ items: [] }), 'Add at least one roast to the sale'],
      [
        'the same roast twice',
        saleBody({ items: [line(BATCH_A, 1), line(BATCH_A, 2)] }),
        'Each roast can appear only once in a sale',
      ],
      ['a zero quantity', saleBody({ items: [line(BATCH_A, 0)] }), 'Line 1: Quantity must be at least 0.001 kg'],
      [
        'a negative price on line 2',
        saleBody({ items: [line(BATCH_A, 1), line(BATCH_B, 1, -5)] }),
        'Line 2: Price per kg cannot be negative',
      ],
      ['a Cancelled status', saleBody({ status: 'Cancelled' }), 'A new sale must be Draft, Confirmed or Delivered'],
      ['an unknown currency', saleBody({ currency: 'GBP' }), 'Currency must be THB, USD, EUR, JPY or CNY'],
      ['a date that does not exist', saleBody({ orderDate: '2026-02-30' }), 'Sale date must be a valid date'],
      // zod 4 still runs the refine after the regex fails; '' must not crash it.
      ['an empty sale date', saleBody({ orderDate: '' }), 'Sale date must be a date like 2026-09-23'],
      ['a sale date that is not a date', saleBody({ orderDate: 'yesterday' }), 'Sale date must be a date like 2026-09-23'],
      ['a missing customer', saleBody({ customerId: undefined }), 'Choose a customer'],
    ])('400 for %s', async (_name, body, message) => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(body))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe(message)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('400 for a sale date after tomorrow', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ orderDate: future() })))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Sale date cannot be in the future')
    })

    test("tomorrow is allowed, for clients ahead of Bangkok time", async () => {
      mockAuthUser = roaster
      const tomorrow = dateOnly(new Date(todayDateOnly().getTime() + DAY_MS))
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ orderDate: tomorrow })))
      expect(response.status).toBe(201)
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.orderDate).toEqual(
        new Date(`${tomorrow}T12:00:00.000Z`),
      )
    })

    test('404 for an unknown customer', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ customerId: OTHER_CUSTOMER })))
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe('Customer not found')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('404 for a roast that no longer exists', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([batchRow(BATCH_A)])
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(saleBody({ items: [line(BATCH_A, 1), line(BATCH_B, 1)] })),
      )
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe(
        'One of the roasts on this sale no longer exists. Reload and try again.',
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test("403 when a roaster sells another roaster's roast", async () => {
      mockAuthUser = otherRoaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe('You can only sell roasts from your own Roast Logbook.')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test("403 when an Admin sells a roaster's roast in their own name", async () => {
      mockAuthUser = admin
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('an Admin may sell their own roast', async () => {
      mockAuthUser = admin
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([batchRow(BATCH_A, { roasterId: 'admin-1' })])
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(201)
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.createdBy).toBe('admin-1')
    })

    test('409 for a roast with no roasted weight yet', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([batchRow(BATCH_A, { roastedWeightKg: null })])
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Roast RB-1581 has no roasted weight yet. Add it in the Roast Logbook before selling it.',
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('prices every line on the server and ignores client amounts', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(
          saleBody({
            totalAmount: 1,
            items: [{ ...line(BATCH_A, 2.5, 380), subtotal: 999, lotGrade: 'Fake', greenBeanLotId: LOT_B }],
          }),
        ),
      )
      expect(response.status).toBe(201)
      const rows = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        roastBatchId: BATCH_A,
        greenBeanLotId: LOT_A,
        lotGrade: 'Grade A',
        quantity: 2.5,
        pricePerKg: 380,
        subtotal: 950,
        saleOrderId: ORDER_ID,
      })
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.totalAmount).toBe(950)
    })

    test('three lines of 0.1 kg at 1 total exactly 0.3', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(
          saleBody({ items: [line(BATCH_A, 0.1, 1), line(BATCH_B, 0.1, 1), line(BATCH_C, 0.1, 1)] }),
        ),
      )
      expect(response.status).toBe(201)
      // 0.1 + 0.1 + 0.1 is 0.30000000000000004 in floating point.
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.totalAmount).toBe(0.3)
    })

    test('kg round to the gram and prices to the cent', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ items: [line(BATCH_A, 1.23456, 99.999)] })))
      expect(response.status).toBe(201)
      const [row] = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(row.quantity).toBe(1.235)
      expect(row.pricePerKg).toBe(100)
      expect(row.subtotal).toBe(123.5)
      // The stock SQL holds the rounded kg too.
      expect(rawCalls()[0].values[0]).toBe(1.235)
    })

    test('the line takes its lot and grade from the roast (grade cut to 50) and the sale snapshots the customer', async () => {
      mockAuthUser = roaster
      const longGrade = 'G'.repeat(80)
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([
        batchRow(BATCH_B, { greenBeanLot: { grade: longGrade } }),
      ])
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ items: [line(BATCH_B, 1)] })))
      expect(response.status).toBe(201)
      const row = mockTx.saleOrderItem.createMany.mock.calls[0][0].data[0]
      expect(row.greenBeanLotId).toBe(LOT_B)
      expect(row.lotGrade).toBe('G'.repeat(50))
      expect(mockTx.saleOrder.create.mock.calls[0][0].data).toMatchObject({
        customerId: CUSTOMER,
        customerName: 'Cafe Doi',
        customerPhone: '081-234-5678',
        customerAddress: '12 Nimman Rd, Chiang Mai',
      })
    })

    test('reserves each roast once, in id order, inside the transaction', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(
        postRequest(saleBody({ items: [line(BATCH_C, 1.5), line(BATCH_A, 2.5), line(BATCH_B, 0.25)] })),
      )
      expect(response.status).toBe(201)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 15000 })

      const calls = rawCalls()
      expect(calls).toHaveLength(3)
      for (const call of calls) expect(call.sql).toContain(RESERVE_SQL)
      expect(calls.map((c: any) => c.values[1])).toEqual([BATCH_A, BATCH_B, BATCH_C])
      expect(calls.map((c: any) => c.values[0])).toEqual([2.5, 0.25, 1.5])

      // Defaults: Confirmed, THB, today at 12:00Z.
      const data = mockTx.saleOrder.create.mock.calls[0][0].data
      expect(data.status).toBe('Confirmed')
      expect(data.currency).toBe('THB')
      expect(data.orderDate.toISOString()).toMatch(/T12:00:00\.000Z$/)
      expect(data.orderDate).toEqual(todayDateOnly())

      // Lines keep the order they were entered in.
      const rows = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(rows.map((r: any) => r.roastBatchId)).toEqual([BATCH_C, BATCH_A, BATCH_B])
      const times = rows.map((r: any) => r.createdAt.getTime())
      expect(times[1]).toBeGreaterThan(times[0])
      expect(times[2]).toBeGreaterThan(times[1])
    })

    test('a Draft sale holds its kg too', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ status: 'Draft' })))
      expect(response.status).toBe(201)
      expect(rawCalls()).toHaveLength(1)
      expect(mockTx.saleOrder.create.mock.calls[0][0].data.status).toBe('Draft')
    })

    test('409 naming the roast and the free kg when the stock is gone', async () => {
      mockAuthUser = roaster
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      mockTx.roastBatch.findUnique.mockResolvedValueOnce({ roastedWeightKg: 10, soldWeightKg: 8.5 })
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody({ items: [line(BATCH_A, 2)] })))
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toContain('RB-1581')
      expect(body.error).toContain('at most 1.5 kg')
      expect(body.error).toContain('2 kg asked')
      expect(body.roastBatchId).toBe(BATCH_A)
      expect(body.maxKg).toBe(1.5)
      expect(mockTx.saleOrder.findUnique).not.toHaveBeenCalled()
    })

    test('retries on a taken order number, then succeeds', async () => {
      mockAuthUser = roaster
      mockNextOrderNumber.mockResolvedValueOnce('ORD-2026-0001').mockResolvedValueOnce('ORD-2026-0002')
      mockTx.saleOrder.create.mockRejectedValueOnce(Object.assign(new Error('Unique'), { code: 'P2002' }))
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(201)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
      expect(mockTx.saleOrder.create.mock.calls[1][0].data.orderNumber).toBe('ORD-2026-0002')
    })

    test('409 after five taken order numbers', async () => {
      mockAuthUser = roaster
      mockTx.saleOrder.create.mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }))
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Unable to generate a unique sale order number. Please try again.',
      )
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(5)
    })

    test('409 when a customer or roast disappears mid-write', async () => {
      mockAuthUser = roaster
      mockTx.saleOrderItem.createMany.mockRejectedValueOnce(
        Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }),
      )
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(SALE_REF_GONE_MESSAGE)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('201 with the recorded sale and the roasts whose stock moved', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/sale-orders/route')
      const response = await POST(postRequest(saleBody()))
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.message).toBe('Sale recorded')
      expect(body.affectedRoastBatches).toEqual([{ id: BATCH_A, soldWeightKg: 2.5, availableKg: 7.5 }])
      expect(body.saleOrder).toMatchObject({
        id: ORDER_ID,
        orderNumber: 'ORD-2026-0001',
        customerName: 'Cafe Doi',
        status: 'Confirmed',
        totalAmount: 950,
        invoiceCount: 2,
        creatorName: 'Roaster One',
        updatedAt: UPDATED_AT.toISOString(),
      })
      expect(body.saleOrder.items[0].roast).toMatchObject({ id: BATCH_A, label: 'RB-1581', availableKg: 7.5 })
    })
  })

  describe('GET /api/sale-orders', () => {
    test("a roaster's list stays scoped to their sales even with a search", async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest('?search=doi'))
      expect(response.status).toBe(200)
      const args = mockPrisma.saleOrder.findMany.mock.calls[0][0]
      expect(args.where.AND).toContainEqual({ createdBy: 'roaster-1' })
      expect(args.where.AND).toContainEqual({
        OR: expect.arrayContaining([{ orderNumber: { contains: 'doi', mode: 'insensitive' } }]),
      })
      expect(args.where.OR).toBeUndefined()
      expect(args.orderBy).toEqual([{ orderDate: 'desc' }, { createdAt: 'desc' }])
    })

    test("an Admin's list has no owner scope", async () => {
      mockAuthUser = admin
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest())
      expect(response.status).toBe(200)
      const args = mockPrisma.saleOrder.findMany.mock.calls[0][0]
      expect(JSON.stringify(args.where)).not.toContain('createdBy')
    })

    test.each([
      ['Processor', processor],
      ['Farmer', farmer],
    ])('a %s gets an empty list without a query', async (_role, user) => {
      mockAuthUser = user
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest())
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ saleOrders: [] })
      expect(mockPrisma.saleOrder.findMany).not.toHaveBeenCalled()
    })

    test('serializes lines with live roast facts and snapshot grades', async () => {
      mockAuthUser = roaster
      const externalRoast = roastSummaryRow(BATCH_B, {
        roastLevel: null,
        roastedWeightKg: null,
        greenBeanLot: {
          id: LOT_B,
          displayId: null,
          grade: '  ',
          externalSource: { variety: ' Geisha ', processType: '   ' },
          parchmentLot: null,
        },
      })
      mockPrisma.saleOrder.findMany.mockResolvedValueOnce([
        orderRow({
          items: [
            orderRow().items[0],
            {
              ...orderRow().items[0],
              id: 'item-2',
              roastBatchId: BATCH_B,
              greenBeanLotId: LOT_B,
              lotGrade: 'Grade B',
              roastBatch: externalRoast,
            },
            {
              ...orderRow().items[0],
              id: 'item-legacy',
              roastBatchId: null,
              lotGrade: 'Screen 16',
              roastBatch: null,
            },
          ],
        }),
      ])
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest())
      const [order] = (await response.json()).saleOrders

      expect(order.invoiceCount).toBe(2)
      expect(order.customerName).toBe('Cafe Doi')
      expect(order.customer.name).toBe('Cafe Doi (renamed)')
      expect(order.orderDate).toBe('2026-09-20T12:00:00.000Z')

      expect(order.items[0].roast).toEqual({
        id: BATCH_A,
        label: 'RB-1581',
        roastDate: '2026-09-18T12:00:00.000Z',
        roastLevel: 'Medium',
        roastedWeightKg: 10,
        soldWeightKg: 2.5,
        availableKg: 7.5,
        greenBeanLotId: LOT_A,
        greenBeanLotDisplayId: 'GB-2026-3',
        grade: 'Grade A',
        variety: 'Catimor',
        process: 'Washed',
      })
      expect(order.items[1].lotGrade).toBe('Grade B')
      expect(order.items[1].roast).toMatchObject({
        label: 'RB-5183',
        roastLevel: null,
        availableKg: 0,
        grade: null,
        variety: 'Geisha',
        process: null,
        greenBeanLotDisplayId: null,
      })
      expect(order.items[2]).toMatchObject({ roastBatchId: null, lotGrade: 'Screen 16', roast: null })
    })

    test('date filters cover whole days', async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest('?startDate=2026-09-01&endDate=2026-09-30'))
      expect(response.status).toBe(200)
      const and = mockPrisma.saleOrder.findMany.mock.calls[0][0].where.AND
      expect(and).toContainEqual({ orderDate: { gte: new Date('2026-09-01T00:00:00.000Z') } })
      expect(and).toContainEqual({ orderDate: { lt: new Date('2026-10-01T00:00:00.000Z') } })
    })

    test('400 for a start date that is not a date', async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest('?startDate=2026-13-01'))
      expect(response.status).toBe(400)
      expect(mockPrisma.saleOrder.findMany).not.toHaveBeenCalled()
    })

    test.each(['?startDate=', '?endDate='])('400, not 500, for an empty date filter (%s)', async (query) => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/sale-orders/route')
      const response = await GET(getListRequest(query))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Validation Error')
      expect(mockPrisma.saleOrder.findMany).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/sale-orders/[id]', () => {
    test("403 for another roaster's sale", async () => {
      mockAuthUser = otherRoaster
      const { GET } = await import('@/app/api/sale-orders/[id]/route')
      const response = await GET(new NextRequest(`http://localhost/api/sale-orders/${ORDER_ID}`), routeParams)
      expect(response.status).toBe(403)
    })

    test('404 Sale not found', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.findUnique.mockResolvedValueOnce(null)
      const { GET } = await import('@/app/api/sale-orders/[id]/route')
      const response = await GET(new NextRequest(`http://localhost/api/sale-orders/${ORDER_ID}`), routeParams)
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe('Sale not found')
    })

    test('the owner gets the serialized sale, without farmer names', async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/sale-orders/[id]/route')
      const response = await GET(new NextRequest(`http://localhost/api/sale-orders/${ORDER_ID}`), routeParams)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.saleOrder.orderNumber).toBe('ORD-2026-0001')
      expect(JSON.stringify(body)).not.toContain('farmerName')
    })
  })

  describe('PUT /api/sale-orders/[id]', () => {
    test("403 for another roaster's sale", async () => {
      mockAuthUser = otherRoaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ notes: 'x' }), routeParams)
      expect(response.status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test("an Admin may edit a roaster's sale", async () => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ notes: 'Paid in cash' }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.saleOrder.updateMany.mock.calls[0][0].data.notes).toBe('Paid in cash')
    })

    test('404 Sale not found', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.findUnique.mockResolvedValueOnce(null)
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ notes: 'x' }), routeParams)
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe('Sale not found')
    })

    test('409 when the form was opened before someone else changed the sale', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(
        putRequest({ notes: 'x', expectedUpdatedAt: '2026-09-20T09:59:59.000Z' }),
        routeParams,
      )
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(SALE_CHANGED_MESSAGE)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('the same instant in another format passes', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(
        putRequest({ notes: 'x', expectedUpdatedAt: '2026-09-20T10:00:00Z' }),
        routeParams,
      )
      expect(response.status).toBe(200)
    })

    test('409 when the sale changed between the read and the write', async () => {
      mockAuthUser = roaster
      mockTx.saleOrder.updateMany.mockResolvedValueOnce({ count: 0 })
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [line(BATCH_A, 3)] }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(SALE_CHANGED_MESSAGE)
      expect(mockTx.saleOrderItem.deleteMany).not.toHaveBeenCalled()
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
    })

    test('the guarded header update is the first statement and bumps updatedAt', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [line(BATCH_A, 3)] }), routeParams)
      expect(response.status).toBe(200)
      const update = mockTx.saleOrder.updateMany.mock.calls[0][0]
      expect(update.where).toEqual({ id: ORDER_ID, updatedAt: UPDATED_AT })
      expect(update.data.updatedAt).toBeInstanceOf(Date)
      expect(update.data.totalAmount).toBe(1140)

      const first = mockTx.saleOrder.updateMany.mock.invocationCallOrder[0]
      const later = [
        ...mockTx.saleOrderItem.deleteMany.mock.invocationCallOrder,
        ...mockTx.saleOrderItem.createMany.mock.invocationCallOrder,
        ...mockTx.$executeRaw.mock.invocationCallOrder,
        ...mockTx.saleOrder.findUnique.mock.invocationCallOrder,
      ]
      expect(later.length).toBeGreaterThan(0)
      for (const order of later) expect(order).toBeGreaterThan(first)
    })

    test('cancelling releases every roast and reserves nothing', async () => {
      mockAuthUser = roaster
      existingSale.items = [
        { roastBatchId: BATCH_B, quantity: 1 },
        { roastBatchId: BATCH_A, quantity: 2 },
      ]
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Cancelled' }), routeParams)
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(2)
      for (const call of calls) expect(call.sql).toContain(RELEASE_SQL)
      expect(calls.map((c: any) => [c.values[1], c.values[0]])).toEqual([
        [BATCH_A, 2],
        [BATCH_B, 1],
      ])
      expect((await response.json()).affectedRoastBatches).toHaveLength(2)
    })

    test('un-cancelling reserves the kg again', async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Confirmed' }), routeParams)
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(RESERVE_SQL)
      expect(calls[0].values.slice(0, 2)).toEqual([2, BATCH_A])
    })

    test('409 when un-cancelling and the stock is gone; the max is the free kg', async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      mockTx.roastBatch.findUnique.mockResolvedValueOnce({ roastedWeightKg: 10, soldWeightKg: 9.5 })
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Confirmed' }), routeParams)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toContain('at most 0.5 kg')
      expect(body.error).toContain('2 kg asked')
      expect(body.maxKg).toBe(0.5)
    })

    test('line edits move only the difference per roast', async () => {
      mockAuthUser = roaster
      existingSale.items = [
        { roastBatchId: BATCH_A, quantity: 2 },
        { roastBatchId: BATCH_B, quantity: 1.5 },
      ]
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      // A: 2 -> 3 (reserve 1), B removed (release 1.5), C added (reserve 0.75).
      const response = await PUT(
        putRequest({ items: [line(BATCH_A, 3), line(BATCH_C, 0.75)] }),
        routeParams,
      )
      expect(response.status).toBe(200)
      const calls = rawCalls()
      expect(calls).toHaveLength(3)
      expect(calls[0].sql).toContain(RESERVE_SQL)
      expect(calls[0].values.slice(0, 2)).toEqual([1, BATCH_A])
      expect(calls[1].sql).toContain(RELEASE_SQL)
      expect(calls[1].values).toEqual([1.5, BATCH_B])
      expect(calls[2].sql).toContain(RESERVE_SQL)
      expect(calls[2].values.slice(0, 2)).toEqual([0.75, BATCH_C])

      expect(mockTx.saleOrderItem.deleteMany).toHaveBeenCalledWith({ where: { saleOrderId: ORDER_ID } })
      const rows = mockTx.saleOrderItem.createMany.mock.calls[0][0].data
      expect(rows.map((r: any) => [r.roastBatchId, r.quantity, r.saleOrderId])).toEqual([
        [BATCH_A, 3, ORDER_ID],
        [BATCH_C, 0.75, ORDER_ID],
      ])
    })

    test('409 when a line grows past the free kg; the max adds back what the sale holds', async () => {
      mockAuthUser = roaster
      mockTx.$executeRaw.mockResolvedValueOnce(0)
      mockTx.roastBatch.findUnique.mockResolvedValueOnce({ roastedWeightKg: 10, soldWeightKg: 9.5 })
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [line(BATCH_A, 3)] }), routeParams)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toContain('at most 2.5 kg')
      expect(body.error).toContain('3 kg asked')
    })

    test("editing a cancelled sale's lines moves no stock", async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [line(BATCH_A, 5), line(BATCH_B, 1)] }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
      expect(mockTx.saleOrderItem.createMany).toHaveBeenCalled()
    })

    test.each([
      ['Confirmed', 'Delivered'],
      ['Delivered', 'Draft'],
      ['Draft', 'Confirmed'],
    ])('%s -> %s moves no stock', async (from, to) => {
      mockAuthUser = roaster
      existingSale.status = from
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: to }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
      expect(mockTx.saleOrder.updateMany.mock.calls[0][0].data.status).toBe(to)
    })

    test('a notes-only edit moves no stock and keeps the lines', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ notes: '  ' }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
      expect(mockTx.saleOrderItem.deleteMany).not.toHaveBeenCalled()
      expect(mockTx.saleOrder.updateMany.mock.calls[0][0].data.notes).toBeNull()
      const body = await response.json()
      expect(body.message).toBe('Sale updated')
      expect(body.affectedRoastBatches).toEqual([])
    })

    test('changing the customer moves the snapshot with it', async () => {
      mockAuthUser = roaster
      existingSale.customerId = OTHER_CUSTOMER
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ customerId: CUSTOMER }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.saleOrder.updateMany.mock.calls[0][0].data).toMatchObject({
        customerId: CUSTOMER,
        customerName: 'Cafe Doi',
        customerPhone: '081-234-5678',
        customerAddress: '12 Nimman Rd, Chiang Mai',
      })
    })

    test('404 for an unknown new customer', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ customerId: OTHER_CUSTOMER }), routeParams)
      expect(response.status).toBe(404)
      expect((await response.json()).error).toBe('Customer not found')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test.each([
      ['the owner', roaster],
      ['an Admin', admin],
    ])("403 when %s adds a roast from another roaster's logbook", async (_who, user) => {
      mockAuthUser = user
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([
        batchRow(BATCH_A),
        batchRow(BATCH_B, { roasterId: 'admin-1' }),
      ])
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [line(BATCH_A, 2), line(BATCH_B, 1)] }), routeParams)
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe(
        'Every roast on a sale must come from the roaster who recorded the sale.',
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('409 when editing the lines of a sale recorded before roast sales', async () => {
      mockAuthUser = roaster
      existingSale.items = [{ roastBatchId: null, quantity: 20 }]
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ items: [line(BATCH_A, 1)] }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain('recorded before roast sales')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('an older green-bean sale can still change status, with no stock SQL', async () => {
      mockAuthUser = roaster
      existingSale.items = [{ roastBatchId: null, quantity: 20 }]
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ status: 'Cancelled' }), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
    })

    test('400 when there is nothing to update', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ expectedUpdatedAt: UPDATED_AT.toISOString() }), routeParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Nothing to update')
    })

    test('400, not 500, for an empty sale date', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ orderDate: '' }), routeParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Sale date must be a date like 2026-09-23')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('400 for a sale date in the future', async () => {
      mockAuthUser = roaster
      const future = dateOnly(new Date(todayDateOnly().getTime() + 2 * DAY_MS))
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest({ orderDate: future }), routeParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Sale date cannot be in the future')
    })

    test('400 for a malformed JSON body', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/sale-orders/[id]/route')
      const response = await PUT(putRequest('{bad json'), routeParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Invalid JSON body')
    })
  })

  describe('DELETE /api/sale-orders/[id]', () => {
    test('returns the kg of a live sale to its roasts and removes its invoices', async () => {
      mockAuthUser = roaster
      mockTx.invoice.deleteMany.mockResolvedValueOnce({ count: 2 })
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        message: 'Sale deleted',
        deletedInvoices: 2,
        affectedRoastBatches: [{ id: BATCH_A, soldWeightKg: 2.5, availableKg: 7.5 }],
      })
      const calls = rawCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toContain(RELEASE_SQL)
      expect(calls[0].values).toEqual([2, BATCH_A])
      expect(mockTx.saleOrder.deleteMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, updatedAt: UPDATED_AT },
      })
    })

    test('a cancelled sale returns nothing to stock', async () => {
      mockAuthUser = roaster
      existingSale.status = 'Cancelled'
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
      expect((await response.json()).affectedRoastBatches).toEqual([])
    })

    test('invoices go before the sale, inside the transaction', async () => {
      mockAuthUser = roaster
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      await DELETE(deleteRequest(), routeParams)
      expect(mockTx.invoice.deleteMany).toHaveBeenCalledWith({ where: { saleOrderId: ORDER_ID } })
      expect(mockTx.invoice.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        mockTx.saleOrder.deleteMany.mock.invocationCallOrder[0],
      )
    })

    test('409 when the sale changed before the delete landed', async () => {
      mockAuthUser = roaster
      mockTx.saleOrder.deleteMany.mockResolvedValueOnce({ count: 0 })
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(SALE_CHANGED_MESSAGE)
      expect(mockTx.$executeRaw).not.toHaveBeenCalled()
    })

    test('409 for a stale expectedUpdatedAt, 400 for one that is not a date', async () => {
      mockAuthUser = roaster
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const stale = await DELETE(deleteRequest('?expectedUpdatedAt=2026-09-19T10:00:00.000Z'), routeParams)
      expect(stale.status).toBe(409)
      const bad = await DELETE(deleteRequest('?expectedUpdatedAt=nope'), routeParams)
      expect(bad.status).toBe(400)
      expect((await bad.json()).error).toBe('Invalid expectedUpdatedAt')
      const fresh = await DELETE(
        deleteRequest(`?expectedUpdatedAt=${encodeURIComponent(UPDATED_AT.toISOString())}`),
        routeParams,
      )
      expect(fresh.status).toBe(200)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test("403 for another roaster's sale, 404 when missing", async () => {
      mockAuthUser = otherRoaster
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const forbidden = await DELETE(deleteRequest(), routeParams)
      expect(forbidden.status).toBe(403)

      mockAuthUser = roaster
      mockPrisma.saleOrder.findUnique.mockResolvedValueOnce(null)
      const missing = await DELETE(deleteRequest(), routeParams)
      expect(missing.status).toBe(404)
      expect((await missing.json()).error).toBe('Sale not found')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('409 when an invoice is created in between (P2003)', async () => {
      mockAuthUser = roaster
      mockTx.saleOrder.deleteMany.mockRejectedValueOnce(
        Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }),
      )
      const { DELETE } = await import('@/app/api/sale-orders/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(SALE_CHANGED_MESSAGE)
    })
  })
})
