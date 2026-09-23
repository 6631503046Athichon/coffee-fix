/**
 * Setting a green bean lot's price.
 *
 * PUT /api/green-bean-lots/[id] is the Processor workbench's "Set price"
 * action; POST /api/pricing-history is the older direct entry point; and
 * POST /api/parchment-lots/[id]/withdrawals can price the lots it creates at
 * Hull & Grade time. Every path must check who is pricing, validate the
 * price, stamp priceSetDate/priceSetBy and leave a pricing-history row.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { todayDateOnly } from '@/lib/utils'

// Writes must go through the transaction client. The top-level client and
// the `tx` client are separate mocks, so a write that escaped the transaction
// lands on mockPrisma and the "not called outside" assertions catch it.
const txMock: any = {
  greenBeanLot: {
    update: jest.fn(),
    create: jest.fn(),
  },
  pricingHistory: {
    create: jest.fn(),
  },
  parchmentLot: {
    findUnique: jest.fn(async () => ({ currentWeightKg: 0 })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async () => ({})),
  },
  parchmentWithdrawal: {
    create: jest.fn(async () => ({ id: 'pw-1' })),
  },
}

const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
    findMany: jest.fn(async () => []),
    update: jest.fn(),
    create: jest.fn(),
  },
  pricingHistory: {
    create: jest.fn(),
  },
  parchmentLot: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  parchmentWithdrawal: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(txMock)),
}

const expectNoWritesOutsideTransaction = () => {
  expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.greenBeanLot.create).not.toHaveBeenCalled()
  expect(mockPrisma.pricingHistory.create).not.toHaveBeenCalled()
  expect(mockPrisma.parchmentLot.updateMany).not.toHaveBeenCalled()
  expect(mockPrisma.parchmentLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.parchmentWithdrawal.create).not.toHaveBeenCalled()
}

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
  requireOwnership: jest.fn(
    (user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
      if (user.isSuperAdmin) return
      if (user.roles.some((role: string) => allowedRoles.includes(role))) return
      if (!ownerId || user.id !== ownerId) throw new Error('Insufficient permissions')
    },
  ),
  // Same bodies as lib/middleware's handleApiError: a failed role or
  // ownership check goes out as 403 { error: 'Forbidden' }.
  handleApiError: jest.fn((error: any) => {
    if (error.message === 'Unauthorized') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    if (error.message === 'Insufficient permissions') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }),
}))

const processor = { id: 'processor-1', name: 'Processor One', roles: ['Processor'], isSuperAdmin: false }
const otherProcessor = { id: 'processor-2', name: 'Processor Two', roles: ['Processor'], isSuperAdmin: false }
const admin = { id: 'admin-1', name: 'Admin', roles: ['Admin'], isSuperAdmin: false }
const roaster = { id: 'roaster-1', name: 'Roaster', roles: ['Roaster'], isSuperAdmin: false }
const farmer = { id: 'farmer-1', name: 'Farmer', roles: ['Farmer'], isSuperAdmin: false }

const existingLot = {
  id: 'lot-1',
  currentWeightKg: 60,
  availabilityStatus: 'Available',
  createdById: 'processor-1',
  currency: null,
}

const lotParams = { params: Promise.resolve({ id: 'lot-1' }) }

const putRequest = (body: unknown) =>
  new NextRequest('http://localhost:3001/api/green-bean-lots/lot-1', {
    method: 'PUT',
    body: JSON.stringify(body),
  })

const pricingRequest = (body: unknown) =>
  new NextRequest('http://localhost:3001/api/pricing-history', {
    method: 'POST',
    body: JSON.stringify(body),
  })

describe('green bean lot pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(existingLot)
    txMock.greenBeanLot.update.mockImplementation(async ({ where, data }: any) => ({
      ...existingLot,
      ...data,
      id: where.id,
      parchmentLot: null,
      priceSetter: null,
      withdrawalHistory: [],
    }))
    txMock.pricingHistory.create.mockImplementation(async ({ data }: any) => ({
      id: 'ph-1',
      ...data,
    }))
  })

  describe('PUT /api/green-bean-lots/[id]', () => {
    test('the owning processor sets a price: lot stamped and history written in THB by default', async () => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ pricePerKg: 185.5 }), lotParams)

      expect(response.status).toBe(200)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)

      const updateData = txMock.greenBeanLot.update.mock.calls[0][0].data
      expect(updateData).toMatchObject({
        pricePerKg: 185.5,
        currency: 'THB',
        priceSetBy: 'processor-1',
      })
      // No date sent: today on Thai time, anchored at 12:00 UTC like a
      // picked date, so it never reads back as the previous (UTC) day.
      expect(updateData.priceSetDate).toEqual(todayDateOnly())
      expect(updateData.priceSetDate.toISOString()).toMatch(/T12:00:00\.000Z$/)

      expect(txMock.pricingHistory.create).toHaveBeenCalledTimes(1)
      const history = txMock.pricingHistory.create.mock.calls[0][0].data
      expect(history).toMatchObject({
        greenBeanLotId: 'lot-1',
        pricePerKg: 185.5,
        currency: 'THB',
        setBy: 'processor-1',
      })
      expect(history.effectiveDate).toEqual(updateData.priceSetDate)
      expectNoWritesOutsideTransaction()

      const body = await response.json()
      expect(body.greenBeanLot.pricePerKg).toBe(185.5)
      expect(body.greenBeanLot.priceSetBy).toBe('processor-1')
    })

    test("falls back to the lot's own currency when none is sent", async () => {
      mockAuthUser = processor
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce({ ...existingLot, currency: 'USD' })
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ pricePerKg: 7 }), lotParams)

      expect(response.status).toBe(200)
      expect(txMock.greenBeanLot.update.mock.calls[0][0].data.currency).toBe('USD')
      expect(txMock.pricingHistory.create.mock.calls[0][0].data.currency).toBe('USD')
    })

    test('uses the given effective date for both the lot and the history row', async () => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(
        putRequest({ pricePerKg: '200', currency: 'EUR', priceSetDate: '2026-09-01' }),
        lotParams,
      )

      expect(response.status).toBe(200)
      const updateData = txMock.greenBeanLot.update.mock.calls[0][0].data
      expect(updateData.currency).toBe('EUR')
      expect(updateData.priceSetDate.toISOString()).toBe('2026-09-01T12:00:00.000Z')
      expect(
        txMock.pricingHistory.create.mock.calls[0][0].data.effectiveDate.toISOString(),
      ).toBe('2026-09-01T12:00:00.000Z')
    })

    test('the response carries withdrawal history so a swapped-in lot keeps it', async () => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      await PUT(putRequest({ availabilityStatus: 'Withdrawn' }), lotParams)

      const include = txMock.greenBeanLot.update.mock.calls[0][0].include
      expect(include.withdrawalHistory).toMatchObject({
        include: { withdrawnByUser: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      })
      // No price sent, so no history row.
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    })

    test("403 when a processor prices another processor's lot", async () => {
      mockAuthUser = otherProcessor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ pricePerKg: 150 }), lotParams)

      expect(response.status).toBe(403)
      // The body the frontend's api client turns into the thrown message.
      expect((await response.json()).error).toBe('Forbidden')
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    })

    test("an admin may price any processor's lot", async () => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ pricePerKg: 150 }), lotParams)

      expect(response.status).toBe(200)
      expect(txMock.greenBeanLot.update.mock.calls[0][0].data.priceSetBy).toBe('admin-1')
      expect(txMock.pricingHistory.create.mock.calls[0][0].data.setBy).toBe('admin-1')
    })

    test.each([0, -5, 'abc', null, '150abc', [150], true, '0x10'])('400 for a price of %p', async (price) => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ pricePerKg: price }), lotParams)

      expect(response.status).toBe(400)
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    })

    test('400 for a currency outside the supported list', async () => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ pricePerKg: 150, currency: 'XYZ' }), lotParams)

      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Invalid currency value')
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
    })

    test.each(['not-a-date', '2026-02-30', '2026-02-30T08:00:00Z'])('400 for an effective date of %p', async (priceSetDate) => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(
        putRequest({ pricePerKg: 150, priceSetDate }),
        lotParams,
      )

      expect(response.status).toBe(400)
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
    })

    test.each([
      { currency: 'USD' },
      { priceSetDate: '2020-01-01' },
      { priceSetDate: null },
    ])('400 for %p without a price: no silent re-denomination or re-dating', async (body) => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest(body), lotParams)

      expect(response.status).toBe(400)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    })

    test('400 for an availability status outside the enum', async () => {
      mockAuthUser = processor
      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await PUT(putRequest({ availabilityStatus: 'Sold' }), lotParams)

      expect(response.status).toBe(400)
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/pricing-history', () => {
    test('403 for a farmer', async () => {
      mockAuthUser = farmer
      const { POST } = await import('@/app/api/pricing-history/route')
      const response = await POST(
        pricingRequest({ greenBeanLotId: 'lot-1', pricePerKg: 150, currency: 'THB' }),
      )

      expect(response.status).toBe(403)
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
    })

    test("403 for a processor who does not own the lot", async () => {
      mockAuthUser = otherProcessor
      const { POST } = await import('@/app/api/pricing-history/route')
      const response = await POST(
        pricingRequest({ greenBeanLotId: 'lot-1', pricePerKg: 150, currency: 'THB' }),
      )

      expect(response.status).toBe(403)
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
      expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
    })

    test('404 when the lot does not exist', async () => {
      mockAuthUser = processor
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(null)
      const { POST } = await import('@/app/api/pricing-history/route')
      const response = await POST(
        pricingRequest({ greenBeanLotId: 'missing', pricePerKg: 150, currency: 'THB' }),
      )

      expect(response.status).toBe(404)
    })

    test.each([
      { pricePerKg: 0, currency: 'THB' },
      { pricePerKg: -1, currency: 'THB' },
      { pricePerKg: 'abc', currency: 'THB' },
      { pricePerKg: '150abc', currency: 'THB' },
      { pricePerKg: true, currency: 'THB' },
      { pricePerKg: '0x10', currency: 'THB' },
      { pricePerKg: 150, currency: 'XYZ' },
      { pricePerKg: 150, currency: 'THB', effectiveDate: 'not-a-date' },
      { pricePerKg: 150, currency: 'THB', effectiveDate: '2026-02-30' },
    ])('400 for invalid input %p', async (input) => {
      mockAuthUser = processor
      const { POST } = await import('@/app/api/pricing-history/route')
      const response = await POST(pricingRequest({ greenBeanLotId: 'lot-1', ...input }))

      expect(response.status).toBe(400)
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    })

    test('the owner writes the history row and the lot price in one transaction', async () => {
      mockAuthUser = processor
      const { POST } = await import('@/app/api/pricing-history/route')
      const response = await POST(
        pricingRequest({
          greenBeanLotId: 'lot-1',
          pricePerKg: '160',
          currency: 'THB',
          effectiveDate: '2026-09-10',
        }),
      )

      expect(response.status).toBe(201)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(txMock.pricingHistory.create.mock.calls[0][0].data).toMatchObject({
        greenBeanLotId: 'lot-1',
        pricePerKg: 160,
        currency: 'THB',
        setBy: 'processor-1',
      })
      const lotData = txMock.greenBeanLot.update.mock.calls[0][0].data
      expect(lotData).toMatchObject({
        pricePerKg: 160,
        currency: 'THB',
        priceSetBy: 'processor-1',
      })
      // A picked calendar date is anchored at 12:00 UTC.
      expect(lotData.priceSetDate.toISOString()).toBe('2026-09-10T12:00:00.000Z')
      expectNoWritesOutsideTransaction()
      const body = await response.json()
      expect(body.pricingHistory.id).toBe('ph-1')
      expect(body.message).toBe('Pricing history created successfully')
    })
  })

  describe('POST /api/parchment-lots/[id]/withdrawals (Hull & Grade)', () => {
    const parchmentParams = { params: Promise.resolve({ id: 'parchment-1' }) }
    const hullRequest = (gradedLots: unknown[]) =>
      new NextRequest('http://localhost:3001/api/parchment-lots/parchment-1/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          amountKg: 100,
          withdrawalType: 'HullAndGrade',
          purpose: 'Hull and grade',
          gradedLots,
        }),
      })

    beforeEach(() => {
      mockPrisma.parchmentLot.findUnique.mockImplementation(async (args: any) => {
        if (args.include?.processingBatch) {
          return {
            id: 'parchment-1',
            currentWeightKg: 100,
            processingBatch: { createdById: 'processor-1' },
          }
        }
        if (args.select?.currentWeightKg) return { currentWeightKg: 0 }
        return { id: 'parchment-1', withdrawalHistory: [] }
      })
      let created = 0
      txMock.greenBeanLot.create.mockImplementation(async ({ data }: any) => ({
        id: `gbl-${++created}`,
        ...data,
      }))
    })

    test("403 when a Roaster tries Hull & Grade on a processor's parchment lot", async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
      const response = await POST(
        hullRequest([{ grade: 'Grade A', weight: 80, price: 200 }]),
        parchmentParams,
      )

      expect(response.status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(txMock.greenBeanLot.create).not.toHaveBeenCalled()
      expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    })

    test('a Roaster may still draw RoastingStock', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
      const response = await POST(
        new NextRequest('http://localhost:3001/api/parchment-lots/parchment-1/withdrawals', {
          method: 'POST',
          body: JSON.stringify({
            amountKg: 10,
            withdrawalType: 'RoastingStock',
            purpose: 'Roasting',
            targetRoasterId: 'roaster-1',
          }),
        }),
        parchmentParams,
      )

      expect(response.status).toBe(201)
      expect(txMock.greenBeanLot.create).not.toHaveBeenCalled()
    })

    test.each([-10, '150abc'])('400 for a hull price of %p, before anything is written', async (price) => {
      mockAuthUser = processor
      const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
      const response = await POST(
        hullRequest([{ grade: 'Grade A', weight: 80, price }]),
        parchmentParams,
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(txMock.greenBeanLot.create).not.toHaveBeenCalled()
    })

    test('a priced grade is stamped and audited; an unpriced one is left alone', async () => {
      mockAuthUser = processor
      const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
      const response = await POST(
        hullRequest([
          { grade: 'Grade A', weight: 60, price: 220 },
          { grade: 'Grade B', weight: 20 },
          { grade: 'Grade C', weight: 5, price: 0 },
        ]),
        parchmentParams,
      )

      expect(response.status).toBe(201)
      const [priced, unpriced, zero] = txMock.greenBeanLot.create.mock.calls.map(
        (call: any) => call[0].data,
      )
      expect(priced).toMatchObject({
        pricePerKg: 220,
        currency: 'THB',
        priceSetBy: 'processor-1',
      })
      expect(priced.priceSetDate).toEqual(todayDateOnly())
      expect(unpriced.pricePerKg).toBeUndefined()
      expect(unpriced.priceSetBy).toBeUndefined()
      expect(zero.pricePerKg).toBeUndefined()

      expect(txMock.pricingHistory.create).toHaveBeenCalledTimes(1)
      expect(txMock.pricingHistory.create.mock.calls[0][0].data).toMatchObject({
        greenBeanLotId: 'gbl-1',
        pricePerKg: 220,
        currency: 'THB',
        setBy: 'processor-1',
      })
      expect(txMock.pricingHistory.create.mock.calls[0][0].data.effectiveDate).toEqual(
        priced.priceSetDate,
      )
      expectNoWritesOutsideTransaction()
    })
  })
})
