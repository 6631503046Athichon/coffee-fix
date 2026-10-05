/**
 * A Roaster's purchased (External) lots: the Roaster Workbench's Edit and
 * Delete on the Purchased Lots shelf.
 *
 * - PUT /api/green-bean-lots/:id takes the supplier details (externalSource)
 *   of an External lot, merged over the saved ones, and lets its owner (a
 *   Roaster) or an Admin correct the grade, weight and price. The weight never
 *   goes below what was already claimed or sold.
 * - DELETE /api/green-bean-lots/:id lets the owner (or an Admin) delete an
 *   unused purchased lot; a used one is refused (409) with the reason.
 * - Lots out of processing stay the Processor's (or Admin's).
 *
 * `@/lib/utils` is real. Writes are made on a separate transaction client.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const txMock: any = {
  $queryRaw: jest.fn(),
  greenBeanLot: {
    updateMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  roasterInventoryItem: { deleteMany: jest.fn() },
  pricingHistory: { create: jest.fn() },
}

const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(txMock)),
}

function resetMocks() {
  for (const client of [txMock, mockPrisma]) {
    for (const value of Object.values(client) as any[]) {
      if (typeof value === 'function') value.mockReset()
      else for (const fn of Object.values(value) as any[]) fn.mockReset()
    }
  }
  mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(txMock))
  txMock.greenBeanLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  txMock.greenBeanLot.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }))
  txMock.$queryRaw.mockImplementation(async () => [])
  txMock.roasterInventoryItem.deleteMany.mockImplementation(async () => ({ count: 0 }))
  // The delete may run on the client or inside a transaction.
  for (const client of [mockPrisma, txMock]) {
    client.greenBeanLot.deleteMany.mockImplementation(async () => ({ count: 1 }))
  }
}

/** Deletes of green bean lots issued, on the client or in a transaction. */
const lotDeletes = () =>
  mockPrisma.greenBeanLot.deleteMany.mock.calls.length + txMock.greenBeanLot.deleteMany.mock.calls.length

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
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
  requireOwnership: jest.fn((user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
    if (user.isSuperAdmin) return
    if (user.roles.some((role: string) => allowedRoles.includes(role))) return
    if (!ownerId || user.id !== ownerId) throw new Error('Insufficient permissions')
  }),
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized' ? 401 : error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const ROASTER = { id: 'roaster-1', roles: ['Roaster'], isActive: true, isSuperAdmin: false }
const OTHER_ROASTER = { id: 'roaster-2', roles: ['Roaster'], isActive: true, isSuperAdmin: false }
const PROCESSOR = { id: 'processor-1', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const ADMIN = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const SUPER_ADMIN = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }

const savedSource = {
  originName: 'Doi Chang',
  producerName: 'Ban Mai',
  variety: 'Bourbon',
  processType: 'Natural',
  purchaseDate: '2026-09-01',
  pricePerKg: 250,
  currency: 'THB',
  tasteNote: 'Berry',
  supplierNotes: 'Bag 3',
  // A field the form does not show stays as saved.
  certificateNumber: 'C-77',
}

// roaster-1 bought 25 kg; 5 kg were already claimed into stock.
const purchasedLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'gbl-ext',
  initialWeightKg: 25,
  currentWeightKg: 20,
  availabilityStatus: 'Available',
  createdById: 'roaster-1',
  currency: 'THB',
  sourceType: 'External',
  parchmentLotId: null,
  parchmentWithdrawalId: null,
  externalSource: savedSource,
  ...overrides,
})

const processedLot = (overrides: Record<string, unknown> = {}) =>
  purchasedLot({
    sourceType: 'Internal',
    createdById: 'processor-1',
    parchmentLotId: 'pl-1',
    externalSource: null,
    ...overrides,
  })

function jsonRequest(method: string, body?: unknown, id = 'gbl-ext') {
  return new NextRequest(`http://localhost:3001/api/green-bean-lots/${id}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}
const params = (id = 'gbl-ext') => ({ params: Promise.resolve({ id }) })

async function putLot(body: unknown, id = 'gbl-ext') {
  const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
  return PUT(jsonRequest('PUT', body, id), params(id))
}
async function deleteLot(id = 'gbl-ext') {
  const { DELETE } = await import('@/app/api/green-bean-lots/[id]/route')
  return DELETE(jsonRequest('DELETE', undefined, id), params(id))
}

/** The lot data the edit saved (the update after any re-weigh). */
const savedData = () => txMock.greenBeanLot.update.mock.calls[0][0].data

beforeEach(() => {
  resetMocks()
  mockAuthUser = ROASTER
})

describe('PUT /api/green-bean-lots/[id] on a purchased lot', () => {
  test("its Roaster saves the supplier details, grade, weight and price in one transaction", async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot())

    const response = await putLot({
      grade: 'Grade AA',
      initialWeightKg: 30,
      pricePerKg: 260,
      currency: 'THB',
      externalSource: {
        originName: ' Doi Chang Co-op ',
        producerName: '',
        variety: 'Gesha',
        processType: 'Washed',
        purchaseDate: '2026-09-02',
        pricePerKg: 260,
        currency: 'THB',
        tasteNote: 'Jasmine',
        supplierNotes: null,
      },
    })

    expect(response.status).toBe(200)
    // The 5 kg already claimed stay out: 30 kg bought, 25 kg left.
    expect(txMock.greenBeanLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'gbl-ext', initialWeightKg: 25, currentWeightKg: 20 },
      data: { initialWeightKg: 30, currentWeightKg: 25 },
    })
    const data = savedData()
    expect(data.grade).toBe('Grade AA')
    expect(data.pricePerKg).toBe(260)
    expect(data.priceSetBy).toBe('roaster-1')
    expect(data.externalSource).toEqual({
      originName: 'Doi Chang Co-op',
      variety: 'Gesha',
      processType: 'Washed',
      purchaseDate: '2026-09-02',
      pricePerKg: 260,
      currency: 'THB',
      tasteNote: 'Jasmine',
      certificateNumber: 'C-77',
    })
    expect(txMock.pricingHistory.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
  })

  test('fields left out keep their saved values', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot())

    expect((await putLot({ externalSource: { tasteNote: 'Cocoa' } })).status).toBe(200)
    expect(savedData()).toEqual({ externalSource: { ...savedSource, tasteNote: 'Cocoa' } })
    expect(txMock.greenBeanLot.updateMany).not.toHaveBeenCalled()
  })

  test('refuses (409) a weight below the kg already claimed or sold', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot())

    const response = await putLot({ initialWeightKg: 4 })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/5\.00 kg of this green bean lot has already been withdrawn/)
    expect(body.withdrawnKg).toBe(5)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('a blank price takes the price off the lot, with no pricing-history row', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot({ pricePerKg: 250 }))

    const response = await putLot({ pricePerKg: null, externalSource: { pricePerKg: 0 } })

    expect(response.status).toBe(200)
    expect(savedData()).toMatchObject({
      pricePerKg: null,
      priceSetDate: null,
      priceSetBy: null,
      externalSource: { pricePerKg: 0 },
    })
    expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
  })

  test.each([
    ['an emptied origin', { originName: '  ' }, 'Origin / supplier is required'],
    ['an emptied variety', { variety: '' }, 'Variety is required'],
    ['an impossible purchase date', { purchaseDate: '2026-02-30' }, 'Purchase date is not a real date'],
    ['a purchase date that is not a date', { purchaseDate: 'yesterday' }, 'Purchase date must be a date (YYYY-MM-DD)'],
    ['a negative price', { pricePerKg: -1 }, 'Price per kg cannot be below 0'],
    ['a price as text', { pricePerKg: '250' }, 'Price per kg must be a number'],
    ['a currency it does not know', { currency: 'XYZ' }, undefined],
    ['a field it does not know', { score: 90 }, undefined],
  ])('refuses %s (400) and saves nothing', async (_what, externalSource, message) => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot())

    const response = await putLot({ externalSource })
    const body = await response.json()

    expect(response.status).toBe(400)
    if (message) expect(body.error).toBe(message)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test("another roaster cannot edit it (403)", async () => {
    mockAuthUser = OTHER_ROASTER
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot())

    expect((await putLot({ externalSource: { tasteNote: 'Cocoa' } })).status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test.each([['an Admin', ADMIN], ['a super admin', SUPER_ADMIN]])(
    "%s can edit a roaster's purchased lot",
    async (_who, user) => {
      mockAuthUser = user
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(purchasedLot())

      expect((await putLot({ grade: 'Grade B', externalSource: { variety: 'Typica' } })).status).toBe(200)
      expect(savedData()).toEqual({
        externalSource: { ...savedSource, variety: 'Typica' },
        grade: 'Grade B',
      })
    },
  )

  test('a lot out of processing stays the Processor\'s: a Roaster is refused even on one on record as theirs', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(processedLot({ createdById: 'roaster-1' }))

    expect((await putLot({ grade: 'Grade B' })).status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('a processed lot has no supplier details to send, and its price cannot be blanked (400)', async () => {
    mockAuthUser = PROCESSOR

    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(processedLot())
    const response = await putLot({ externalSource: { originName: 'Somewhere' } })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Only a purchased (External) lot has supplier details')

    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(processedLot())
    expect((await putLot({ pricePerKg: null })).status).toBe(400)

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/green-bean-lots/[id] on a purchased lot', () => {
  const noDependents = {
    withdrawalHistory: 0,
    roasterInventory: 0,
    roastBatches: 0,
    saleOrderItems: 0,
    invoiceItems: 0,
    cuppingSamples: 0,
  }
  const deletable = (overrides: Record<string, unknown> = {}, counts: Record<string, number> = {}) => ({
    createdById: 'roaster-1',
    sourceType: 'External',
    parchmentLotId: null,
    parchmentWithdrawalId: null,
    parchmentLot: null,
    _count: { ...noDependents, ...counts },
    ...overrides,
  })

  test.each([['its Roaster', ROASTER], ['an Admin', ADMIN]])('%s deletes an unused one', async (_who, user) => {
    mockAuthUser = user
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(deletable())

    expect((await deleteLot()).status).toBe(200)
    expect(lotDeletes()).toBe(1)
  })

  test('refuses (409) one already claimed or roasted, with the reason', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(
      deletable({}, { roasterInventory: 1, roastBatches: 2 }),
    )

    const response = await deleteLot()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe(
      'This green bean lot already has 1 roaster stock record and 2 roast batches, so it was not deleted',
    )
    expect(lotDeletes()).toBe(0)
  })

  test('another roaster cannot delete it (403)', async () => {
    mockAuthUser = OTHER_ROASTER
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(deletable())

    expect((await deleteLot()).status).toBe(403)
    expect(lotDeletes()).toBe(0)
  })

  test('a Roaster cannot delete a lot out of processing (403)', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(
      deletable({ sourceType: 'Internal', parchmentLotId: null }),
    )

    expect((await deleteLot()).status).toBe(403)
    expect(lotDeletes()).toBe(0)
  })
})
