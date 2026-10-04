/**
 * Who may read roasts, roaster inventory, invoices and customers now that
 * roasts carry sold kg and sales are scoped to the roaster who recorded them.
 * Also the bulk-load gates and the data-version stamps the sales log relies on.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const findFirstModels = [
  'farm',
  'harvestLot',
  'cropYear',
  'processType',
  'activityType',
  'coffeeGrade',
  'customer',
  'user',
  'soilAnalysis',
  'weatherRecord',
  'gAPLogEntry',
  'processingBatch',
  'parchmentLot',
  'greenBeanLot',
  'roasterInventoryItem',
  'roastBatch',
  'saleOrder',
  'invoice',
  'pricingHistory',
]

const mockTx: any = {
  invoice: { create: jest.fn() },
  invoiceItem: { create: jest.fn() },
}

const mockPrisma: any = {
  $transaction: jest.fn(async (callback: any) => callback(mockTx)),
}
for (const model of findFirstModels) {
  // count: data-version stamps a scoped list with its newest row and count.
  mockPrisma[model] = { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() }
}
Object.assign(mockPrisma.roastBatch, { count: jest.fn() })
Object.assign(mockPrisma.roasterInventoryItem, { findUnique: jest.fn() })
Object.assign(mockPrisma.invoice, { findUnique: jest.fn() })
Object.assign(mockPrisma.saleOrder, { findUnique: jest.fn(), count: jest.fn() })
Object.assign(mockPrisma.customer, {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
})

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

const mockNextInvoiceNumber: any = jest.fn(async () => 'INV-2026-0001')

jest.mock('@/lib/documentNumbers', () => ({
  getNextInvoiceNumber: () => mockNextInvoiceNumber(),
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
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message === 'Insufficient permissions'
          ? 403
          : error.code === 'P2025'
            ? 404
            : error.code === 'P2003'
              ? 400
              : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const otherRoaster = { id: 'roaster-2', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const processor = { id: 'processor-1', roles: ['Processor'], isSuperAdmin: false }
const farmer = { id: 'farmer-1', roles: ['Farmer'], isSuperAdmin: false }

const ORDER_ID = 'e5dd3ab0-ad1b-4aaa-9b34-cea608765224'
const CUSTOMER = 'c0a80121-7ac0-4e1c-9f3b-1a2b3c4d5e6f'

// JSON bodies go out as application/json, like the SPA sends them —
// validateBody refuses any other content type with 415.
const request = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3001${url}`, { headers: { 'Content-Type': 'application/json' }, ...init })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const summaryRow = (id: string, roastedWeightKg: number | null, soldWeightKg: number) => ({
  id,
  roasterId: 'roaster-1',
  roastDate: new Date('2026-09-18T12:00:00.000Z'),
  roastLevel: 'Light',
  roastedWeightKg,
  soldWeightKg,
  greenBeanLotId: 'lot-1',
  greenBeanLot: {
    id: 'lot-1',
    displayId: 'GB-2026-1',
    grade: 'Grade A',
    externalSource: null,
    parchmentLot: { processType: 'Natural', externalSource: null, harvestLot: { cherryVariety: 'Typica' } },
  },
})

describe('sales access and scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    for (const model of findFirstModels) {
      mockPrisma[model].findMany.mockResolvedValue([])
      mockPrisma[model].findFirst.mockResolvedValue({ updatedAt: new Date('2026-09-20T10:00:00.000Z') })
      mockPrisma[model].count.mockResolvedValue(0)
    }
    mockPrisma.pricingHistory.findFirst.mockResolvedValue({ createdAt: new Date('2026-09-19T10:00:00.000Z') })
    mockPrisma.roastBatch.count.mockResolvedValue(0)
    mockPrisma.saleOrder.count.mockResolvedValue(0)
    mockPrisma.customer.count.mockResolvedValue(0)
    mockPrisma.customer.delete.mockResolvedValue({ id: CUSTOMER })
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockTx))
    mockTx.invoice.create.mockResolvedValue({ id: 'invoice-1' })
    mockTx.invoiceItem.create.mockResolvedValue({})
    mockNextInvoiceNumber.mockResolvedValue('INV-2026-0001')
  })

  describe('GET /api/roast-batches', () => {
    test("a roaster's ?roasterId is ignored", async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/roast-batches/route')
      const response = await GET(request('/api/roast-batches?roasterId=roaster-2'))
      expect(response.status).toBe(200)
      expect(mockPrisma.roastBatch.findMany.mock.calls[0][0].where).toEqual({ roasterId: 'roaster-1' })
    })

    test('an Admin may filter by roaster, or see all', async () => {
      mockAuthUser = admin
      const { GET } = await import('@/app/api/roast-batches/route')
      await GET(request('/api/roast-batches?roasterId=roaster-2'))
      await GET(request('/api/roast-batches'))
      expect(mockPrisma.roastBatch.findMany.mock.calls[0][0].where).toEqual({ roasterId: 'roaster-2' })
      expect(mockPrisma.roastBatch.findMany.mock.calls[1][0].where).toEqual({})
    })

    test('403 for a Farmer', async () => {
      mockAuthUser = farmer
      const { GET } = await import('@/app/api/roast-batches/route')
      const response = await GET(request('/api/roast-batches'))
      expect(response.status).toBe(403)
      expect(mockPrisma.roastBatch.findMany).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/roast-batches/sellable', () => {
    test("a roaster gets only their own roasts; ?roasterId is ignored", async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/roast-batches/sellable/route')
      const response = await GET(request('/api/roast-batches/sellable?roasterId=roaster-2'))
      expect(response.status).toBe(200)
      expect(mockPrisma.roastBatch.findMany.mock.calls[0][0].where).toEqual({
        roasterId: 'roaster-1',
        roastedWeightKg: { not: null },
      })
      expect(mockPrisma.roastBatch.count).toHaveBeenCalledWith({
        where: { roasterId: 'roaster-1', roastedWeightKg: null },
      })
    })

    test("an Admin's ?roasterId picks the roaster", async () => {
      mockAuthUser = admin
      const { GET } = await import('@/app/api/roast-batches/sellable/route')
      await GET(request('/api/roast-batches/sellable?roasterId=roaster-2'))
      await GET(request('/api/roast-batches/sellable'))
      expect(mockPrisma.roastBatch.findMany.mock.calls[0][0].where.roasterId).toBe('roaster-2')
      expect(mockPrisma.roastBatch.findMany.mock.calls[1][0].where.roasterId).toBe('admin-1')
    })

    test('leaves out sold-out and unweighed roasts and reports the kg left', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([
        summaryRow('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', 10, 2.5),
        summaryRow('6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b', 10, 10),
        summaryRow('9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f', 10, 9.9996),
        summaryRow('a3bb189e-8bf9-4888-9912-ace4e6543002', 10, 9.999),
        summaryRow('b4cc29af-9c0a-4999-8a23-bdf5f7654113', null, 0),
      ])
      mockPrisma.roastBatch.count.mockResolvedValueOnce(3)
      const { GET } = await import('@/app/api/roast-batches/sellable/route')
      const response = await GET(request('/api/roast-batches/sellable'))
      const body = await response.json()
      expect(body.missingWeightCount).toBe(3)
      expect(body.roastBatches.map((b: any) => [b.id, b.availableKg])).toEqual([
        ['1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', 7.5],
        ['a3bb189e-8bf9-4888-9912-ace4e6543002', 0.001],
      ])
      expect(body.roastBatches[0]).toMatchObject({
        label: 'RB-1581',
        roasterId: 'roaster-1',
        soldWeightKg: 2.5,
        grade: 'Grade A',
        variety: 'Typica',
        process: 'Natural',
        roastDate: '2026-09-18T12:00:00.000Z',
      })
    })

    test('kg left round down to the gram, so the offered maximum always fits the stock guard', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findMany.mockResolvedValueOnce([
        summaryRow('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', 8.4567, 0),
        // 0.3 - 0.1 is 0.19999999999999998 in floating point.
        summaryRow('6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b', 0.3, 0.1),
      ])
      const { GET } = await import('@/app/api/roast-batches/sellable/route')
      const body = await (await GET(request('/api/roast-batches/sellable'))).json()
      expect(body.roastBatches.map((b: any) => b.availableKg)).toEqual([8.456, 0.2])
    })

    test('403 for a Processor', async () => {
      mockAuthUser = processor
      const { GET } = await import('@/app/api/roast-batches/sellable/route')
      const response = await GET(request('/api/roast-batches/sellable'))
      expect(response.status).toBe(403)
      expect(mockPrisma.roastBatch.findMany).not.toHaveBeenCalled()
    })
  })

  describe('roaster inventory', () => {
    test('403 for a Farmer', async () => {
      mockAuthUser = farmer
      const { GET } = await import('@/app/api/roaster-inventory/route')
      const response = await GET(request('/api/roaster-inventory'))
      expect(response.status).toBe(403)
      expect(mockPrisma.roasterInventoryItem.findMany).not.toHaveBeenCalled()
    })

    test("a roaster's ?roasterId is ignored", async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/roaster-inventory/route')
      const response = await GET(request('/api/roaster-inventory?roasterId=roaster-2'))
      expect(response.status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.findMany.mock.calls[0][0].where).toEqual({
        roasterId: 'roaster-1',
      })
    })

    test("403 for another roaster's inventory item; the owner may read it", async () => {
      mockPrisma.roasterInventoryItem.findUnique.mockResolvedValue({ id: 'inv-1', roasterId: 'roaster-1' })
      const { GET } = await import('@/app/api/roaster-inventory/[id]/route')
      mockAuthUser = otherRoaster
      expect((await GET(request('/api/roaster-inventory/inv-1'), params('inv-1'))).status).toBe(403)
      mockAuthUser = roaster
      expect((await GET(request('/api/roaster-inventory/inv-1'), params('inv-1'))).status).toBe(200)
      mockAuthUser = processor
      expect((await GET(request('/api/roaster-inventory/inv-1'), params('inv-1'))).status).toBe(403)
    })
  })

  describe('invoices', () => {
    test("a roaster's list is scoped to their own sales, even with a search", async () => {
      mockAuthUser = roaster
      const { GET } = await import('@/app/api/invoices/route')
      const response = await GET(request('/api/invoices?search=INV'))
      expect(response.status).toBe(200)
      const where = mockPrisma.invoice.findMany.mock.calls[0][0].where
      expect(where.AND).toEqual([{ saleOrder: { createdBy: 'roaster-1' } }])
      expect(where.OR).toBeDefined()
    })

    test("an Admin's list is not scoped", async () => {
      mockAuthUser = admin
      const { GET } = await import('@/app/api/invoices/route')
      await GET(request('/api/invoices'))
      expect(mockPrisma.invoice.findMany.mock.calls[0][0].where.AND).toBeUndefined()
    })

    test('a Processor gets an empty list without a query', async () => {
      mockAuthUser = processor
      const { GET } = await import('@/app/api/invoices/route')
      const response = await GET(request('/api/invoices'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ invoices: [] })
      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled()
    })

    const saleOrder = (over: Record<string, unknown> = {}) => ({
      id: ORDER_ID,
      createdBy: 'roaster-1',
      status: 'Confirmed',
      totalAmount: 950,
      currency: 'THB',
      items: [
        { greenBeanLotId: 'lot-1', lotGrade: 'Grade A', quantity: 2.5, pricePerKg: 380, subtotal: 950 },
      ],
      ...over,
    })
    const postInvoice = () =>
      request('/api/invoices', { method: 'POST', body: JSON.stringify({ saleOrderId: ORDER_ID }) })

    test("403 when invoicing another roaster's sale", async () => {
      mockAuthUser = otherRoaster
      mockPrisma.saleOrder.findUnique.mockResolvedValueOnce(saleOrder())
      const { POST } = await import('@/app/api/invoices/route')
      const response = await POST(postInvoice())
      expect(response.status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('409 when invoicing a cancelled sale', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.findUnique.mockResolvedValueOnce(saleOrder({ status: 'Cancelled' }))
      const { POST } = await import('@/app/api/invoices/route')
      const response = await POST(postInvoice())
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe('A cancelled sale cannot be invoiced')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('a taken invoice number is retried, and five in a row give a 409', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.findUnique.mockResolvedValue(saleOrder())
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1' })
      const unique = Object.assign(new Error('Unique'), { code: 'P2002' })
      const { POST } = await import('@/app/api/invoices/route')

      mockTx.invoice.create.mockRejectedValueOnce(unique)
      const retried = await POST(postInvoice())
      expect(retried.status).toBe(201)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)

      mockPrisma.$transaction.mockClear()
      mockTx.invoice.create.mockRejectedValue(unique)
      const exhausted = await POST(postInvoice())
      expect(exhausted.status).toBe(409)
      expect((await exhausted.json()).error).toBe('Unable to generate a unique invoice number. Please try again.')
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(5)
    })

    test("403 when reading an invoice on another roaster's sale", async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1', saleOrder: { createdBy: 'roaster-1' } })
      const { GET } = await import('@/app/api/invoices/[id]/route')
      mockAuthUser = otherRoaster
      expect((await GET(request('/api/invoices/invoice-1'), params('invoice-1'))).status).toBe(403)
      mockAuthUser = roaster
      expect((await GET(request('/api/invoices/invoice-1'), params('invoice-1'))).status).toBe(200)
      mockAuthUser = admin
      expect((await GET(request('/api/invoices/invoice-1'), params('invoice-1'))).status).toBe(200)
    })
  })

  describe('customers', () => {
    const deleteCustomer = () => request(`/api/customers/${CUSTOMER}`, { method: 'DELETE' })

    test('a Roaster may delete a customer nobody has sold to', async () => {
      mockAuthUser = roaster
      const { DELETE } = await import('@/app/api/customers/[id]/route')
      const response = await DELETE(deleteCustomer(), params(CUSTOMER))
      expect(response.status).toBe(200)
      expect(mockPrisma.saleOrder.count).toHaveBeenCalledWith({ where: { customerId: CUSTOMER } })
      expect(mockPrisma.customer.delete).toHaveBeenCalledWith({ where: { id: CUSTOMER } })
    })

    test('409 when anyone has sold to the customer', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.count.mockResolvedValueOnce(1)
      const { DELETE } = await import('@/app/api/customers/[id]/route')
      const response = await DELETE(deleteCustomer(), params(CUSTOMER))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'This customer has sales recorded (by you or another roaster), so it cannot be deleted.',
      )
      expect(mockPrisma.customer.delete).not.toHaveBeenCalled()
    })

    test('403 for a Processor', async () => {
      mockAuthUser = processor
      const { DELETE } = await import('@/app/api/customers/[id]/route')
      const response = await DELETE(deleteCustomer(), params(CUSTOMER))
      expect(response.status).toBe(403)
      expect(mockPrisma.customer.delete).not.toHaveBeenCalled()
    })

    const createCustomer = () =>
      request('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name: '  Cafe Doi  ', type: 'Retailer', address: ' 12 Nimman Rd ' }),
      })

    test.each([
      ['Processor', processor],
      ['Roaster', roaster],
      ['Admin', admin],
    ])('a %s may add a customer', async (_role, user) => {
      mockAuthUser = user
      mockPrisma.customer.create.mockResolvedValueOnce({ id: CUSTOMER, name: 'Cafe Doi' })
      const { POST } = await import('@/app/api/customers/route')
      const response = await POST(createCustomer())
      expect(response.status).toBe(201)
      expect((await response.json()).customer).toEqual({ id: CUSTOMER, name: 'Cafe Doi' })
      expect(mockPrisma.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'Cafe Doi',
          type: 'Retailer',
          contactEmail: null,
          contactPhone: null,
          address: '12 Nimman Rd',
          notes: null,
        },
      })
    })

    test('403 for a Farmer adding a customer', async () => {
      mockAuthUser = farmer
      const { POST } = await import('@/app/api/customers/route')
      const response = await POST(createCustomer())
      expect(response.status).toBe(403)
      expect(mockPrisma.customer.create).not.toHaveBeenCalled()
    })

    // Editing is open to Processors (D3): see customer-edit-roles.test.ts.
    test('a Processor still cannot list or read customers', async () => {
      mockAuthUser = processor
      const list = await import('@/app/api/customers/route')
      expect((await list.GET(request('/api/customers'))).status).toBe(403)
      expect(mockPrisma.customer.findMany).not.toHaveBeenCalled()

      const one = await import('@/app/api/customers/[id]/route')
      expect((await one.GET(request(`/api/customers/${CUSTOMER}`), params(CUSTOMER))).status).toBe(403)
      expect(mockPrisma.customer.findUnique).not.toHaveBeenCalled()
    })

    test('409 when a sale lands between the count and the delete; 404 when already gone', async () => {
      mockAuthUser = roaster
      const { DELETE } = await import('@/app/api/customers/[id]/route')
      mockPrisma.customer.delete.mockRejectedValueOnce(Object.assign(new Error('FK'), { code: 'P2003' }))
      const raced = await DELETE(deleteCustomer(), params(CUSTOMER))
      expect(raced.status).toBe(409)
      expect((await raced.json()).error).toContain('has sales recorded')

      mockPrisma.customer.delete.mockRejectedValueOnce(Object.assign(new Error('Gone'), { code: 'P2025' }))
      const gone = await DELETE(deleteCustomer(), params(CUSTOMER))
      expect(gone.status).toBe(404)
      expect((await gone.json()).error).toBe('Customer not found')
    })

    test("a roaster's sale counts cover only their own sales", async () => {
      const { GET } = await import('@/app/api/customers/route')
      mockAuthUser = roaster
      await GET(request('/api/customers'))
      expect(mockPrisma.customer.findMany.mock.calls[0][0].include._count.select.saleOrders).toEqual({
        where: { createdBy: 'roaster-1' },
      })
      mockAuthUser = admin
      await GET(request('/api/customers'))
      expect(mockPrisma.customer.findMany.mock.calls[1][0].include._count.select.saleOrders).toBe(true)
    })

    test("a customer's recent sales are the roaster's own", async () => {
      mockAuthUser = roaster
      mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: CUSTOMER, saleOrders: [] })
      const { GET } = await import('@/app/api/customers/[id]/route')
      const response = await GET(request(`/api/customers/${CUSTOMER}`), params(CUSTOMER))
      expect(response.status).toBe(200)
      const include = mockPrisma.customer.findUnique.mock.calls[0][0].include
      expect(include.saleOrders.where).toEqual({ createdBy: 'roaster-1' })
      expect(include._count.select.saleOrders).toEqual({ where: { createdBy: 'roaster-1' } })
    })
  })

  describe('bulk-load', () => {
    const phase = async (n: 1 | 2) => {
      const { GET } = await import('@/app/api/bulk-load/route')
      const response = await GET(request(`/api/bulk-load?phase=${n}`))
      expect(response.status).toBe(200)
      return response.json()
    }

    test('phase 1: a Farmer gets no customers', async () => {
      mockAuthUser = farmer
      const body = await phase(1)
      expect(body.customers).toEqual([])
      expect(mockPrisma.customer.findMany).not.toHaveBeenCalled()
    })

    test.each([
      ['Processor', processor],
      ['Roaster', roaster],
      ['Admin', admin],
    ])('phase 1: a %s gets the shared customers, without sale counts', async (_role, user) => {
      mockAuthUser = user
      mockPrisma.customer.findMany.mockResolvedValueOnce([{ id: CUSTOMER, name: 'Cafe Doi' }])
      const body = await phase(1)
      expect(body.customers).toEqual([{ id: CUSTOMER, name: 'Cafe Doi' }])
      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } })
    })

    test.each([
      ['Farmer', farmer],
      ['Processor', processor],
    ])('phase 2: a %s gets no roasts or roaster inventory', async (_role, user) => {
      mockAuthUser = user
      const body = await phase(2)
      expect(body.roastBatches).toEqual([])
      expect(body.roasterInventory).toEqual([])
      expect(mockPrisma.roastBatch.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.roasterInventoryItem.findMany).not.toHaveBeenCalled()
    })

    test('phase 2: a Roaster gets their own roasts; an Admin gets all', async () => {
      mockAuthUser = roaster
      await phase(2)
      expect(mockPrisma.roastBatch.findMany.mock.calls[0][0].where).toEqual({ roasterId: 'roaster-1' })
      expect(mockPrisma.roasterInventoryItem.findMany.mock.calls[0][0].where).toEqual({
        roasterId: 'roaster-1',
      })

      mockAuthUser = admin
      await phase(2)
      expect(mockPrisma.roastBatch.findMany.mock.calls[1][0].where).toEqual({})
    })
  })

  describe('GET /api/data-version', () => {
    const versions = async () => {
      const { GET } = await import('@/app/api/data-version/route')
      const response = await GET(request('/api/data-version'))
      expect(response.status).toBe(200)
      return response.json()
    }

    test('the saleOrders and customers stamps move when only the row count changes', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.count.mockResolvedValue(7)
      mockPrisma.customer.count.mockResolvedValue(3)
      const before = await versions()

      mockPrisma.saleOrder.count.mockResolvedValue(6)
      const afterSaleDelete = await versions()
      expect(afterSaleDelete.saleOrders).not.toBe(before.saleOrders)
      expect(afterSaleDelete.customers).toBe(before.customers)

      mockPrisma.customer.count.mockResolvedValue(2)
      const afterCustomerDelete = await versions()
      expect(afterCustomerDelete.customers).not.toBe(before.customers)
    })

    test('counted stamps are 16 hex characters; the others keep timestamps', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.count.mockResolvedValue(1234)
      const body = await versions()
      expect(body.saleOrders).toMatch(/^[0-9a-f]{16}$/)
      expect(body.customers).toMatch(/^[0-9a-f]{16}$/)
      // Scoped lists ("each their own") count their rows too.
      expect(body.roastBatches).toMatch(/^[0-9a-f]{16}$/)
      expect(body.pricingHistory).toMatch(/^[0-9a-f]{16}$/)
      expect(body.invoices).toBe('2026-09-20T10:00:00.000Z')
      expect(body.cropYears).toBe('2026-09-20T10:00:00.000Z')
    })

    // The hash is unkeyed, so a roaster who knows the newest updatedAt (from
    // saving a sale) could brute-force the count inside it. The stamps must
    // therefore only ever cover rows the caller can already list.
    test("a roaster's sale and invoice stamps cover only their own sales", async () => {
      mockAuthUser = roaster
      await versions()
      expect(mockPrisma.saleOrder.findFirst.mock.calls[0][0].where).toEqual({ createdBy: 'roaster-1' })
      expect(mockPrisma.saleOrder.count.mock.calls[0][0].where).toEqual({ createdBy: 'roaster-1' })
      expect(mockPrisma.invoice.findFirst.mock.calls[0][0].where).toEqual({ saleOrder: { createdBy: 'roaster-1' } })

      // Another roaster recording or deleting sales leaves this stamp alone.
      let otherRoastersSales = 10
      mockPrisma.saleOrder.count.mockImplementation(async (args: any) =>
        args?.where?.createdBy === 'roaster-1' ? 3 : 3 + otherRoastersSales,
      )
      const before = await versions()
      otherRoastersSales = 11
      const after = await versions()
      expect(after.saleOrders).toBe(before.saleOrders)

      mockAuthUser = admin
      const adminBefore = await versions()
      otherRoastersSales = 12
      const adminAfter = await versions()
      expect(adminAfter.saleOrders).not.toBe(adminBefore.saleOrders)
    })

    test('an Admin gets the stamps over every sale and invoice', async () => {
      mockAuthUser = admin
      await versions()
      expect(mockPrisma.saleOrder.findFirst.mock.calls[0][0].where).toEqual({})
      expect(mockPrisma.saleOrder.count.mock.calls[0][0].where).toEqual({})
      expect(mockPrisma.invoice.findFirst.mock.calls[0][0].where).toEqual({})
    })

    test('roles that cannot read sales or customers get no stamp for them', async () => {
      mockAuthUser = processor
      const processorBody = await versions()
      expect(processorBody.saleOrders).toBeNull()
      expect(processorBody.invoices).toBeNull()
      // Processors pick customers in the Sale withdrawal, so they keep that stamp.
      expect(processorBody.customers).toMatch(/^[0-9a-f]{16}$/)
      expect(mockPrisma.saleOrder.findFirst).not.toHaveBeenCalled()
      expect(mockPrisma.saleOrder.count).not.toHaveBeenCalled()
      expect(mockPrisma.invoice.findFirst).not.toHaveBeenCalled()

      jest.clearAllMocks()
      mockAuthUser = farmer
      const farmerBody = await versions()
      expect(farmerBody.saleOrders).toBeNull()
      expect(farmerBody.invoices).toBeNull()
      expect(farmerBody.customers).toBeNull()
      expect(mockPrisma.customer.findFirst).not.toHaveBeenCalled()
      expect(mockPrisma.customer.count).not.toHaveBeenCalled()
      // No roaster stock or roasts either: bulk-load sends them none.
      expect(farmerBody.roastBatches).toBeNull()
      expect(farmerBody.roasterInventory).toBeNull()
      expect(mockPrisma.roastBatch.findFirst).not.toHaveBeenCalled()
      // Shared reference data is unchanged for them.
      expect(farmerBody.cropYears).toBe('2026-09-20T10:00:00.000Z')
    })

    test('an empty table still gets a stamp', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrder.findFirst.mockResolvedValue(null)
      mockPrisma.saleOrder.count.mockResolvedValue(0)
      const body = await versions()
      expect(body.saleOrders).toMatch(/^[0-9a-f]{16}$/)
    })
  })
})
