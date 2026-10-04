/**
 * POST /api/roast-batches and PUT / DELETE /api/roast-batches/[id]
 * Ownership checks and the inventory bookkeeping that goes with logging,
 * correcting or removing a roast.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  roastBatch: {
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 1 })),
    delete: jest.fn(),
    create: jest.fn(),
  },
  roasterInventoryItem: {
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async () => ({ id: 'inv-1', claimedWeightKg: 50, remainingWeightKg: 30 })),
  },
  saleOrderItem: {
    findMany: jest.fn(async () => []),
  },
  $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
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
const superAdmin = { id: 'super-1', roles: [], isSuperAdmin: true }

const existingUpdatedAt = new Date('2026-09-20T10:00:00.000Z')
const existingRoast = {
  id: 'roast-1',
  updatedAt: existingUpdatedAt,
  roasterId: 'roaster-1',
  roasterInventoryId: 'inv-1',
  greenBeanLotId: 'lot-1',
  batchSizeKg: 10,
  roastedWeightKg: 8.5,
  soldWeightKg: 0,
  yieldPercentage: 85,
  weightLossPct: 15,
  roastLevel: 'Medium',
  roastProfileNotes: 'No notes',
  flavorNotes: null,
}

// What the in-transaction read-back returns: the row plus the inventory the
// frontend reads its new stock figure from.
const updatedRoast = {
  ...existingRoast,
  roasterInventory: { id: 'inv-1', claimedWeightKg: 50, remainingWeightKg: 28 },
}

const routeParams = { params: Promise.resolve({ id: 'roast-1' }) }

const putRequest = (body: unknown) =>
  new NextRequest('http://localhost:3001/api/roast-batches/roast-1', {
    method: 'PUT',
    body: JSON.stringify(body),
  })

const deleteRequest = () =>
  new NextRequest('http://localhost:3001/api/roast-batches/roast-1', { method: 'DELETE' })

describe('roast batch edit and delete', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockAuthError = null
    mockPrisma.roastBatch.findUnique.mockImplementation(async ({ include }: any) =>
      include ? updatedRoast : existingRoast,
    )
    mockPrisma.roastBatch.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.roastBatch.delete.mockResolvedValue(existingRoast)
    mockPrisma.roasterInventoryItem.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.saleOrderItem.findMany.mockResolvedValue([])
  })

  describe('PUT /api/roast-batches/[id]', () => {
    test('401 when not signed in', async () => {
      mockAuthError = new Error('Unauthorized')
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12 }), routeParams)
      expect(response.status).toBe(401)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
    })

    test("403 when a roaster edits someone else's roast", async () => {
      mockAuthUser = otherRoaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12 }), routeParams)
      expect(response.status).toBe(403)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
    })

    test('404 when the roast does not exist', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findUnique.mockResolvedValueOnce(null)
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12 }), routeParams)
      expect(response.status).toBe(404)
    })

    test('an admin may edit any roast', async () => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastLevel: 'Dark' }), routeParams)
      expect(response.status).toBe(200)
      expect(mockPrisma.roastBatch.updateMany.mock.calls[0][0].data).toMatchObject({
        roastLevel: 'Dark',
      })
    })

    test('a larger batch takes only the difference from inventory and re-derives yield', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12, roastedWeightKg: 9 }), routeParams)
      expect(response.status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', remainingWeightKg: { gte: 2 - 1e-6 } },
        data: { remainingWeightKg: { decrement: 2 } },
      })
      const update = mockPrisma.roastBatch.updateMany.mock.calls[0][0]
      expect(update.where).toEqual({
        id: 'roast-1',
        updatedAt: existingUpdatedAt,
        soldWeightKg: { lte: 9 + 1e-6 },
      })
      expect(update.data).toMatchObject({
        batchSizeKg: 12,
        roastedWeightKg: 9,
        yieldPercentage: 75,
        weightLossPct: 25,
      })
      // The frontend reads its new stock figure from this part of the response.
      expect(mockPrisma.roastBatch.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ roasterInventory: expect.anything() }),
        }),
      )
      const body = await response.json()
      expect(body.roastBatch.roasterInventory).toEqual({
        id: 'inv-1',
        claimedWeightKg: 50,
        remainingWeightKg: 28,
      })
    })

    test('a smaller batch returns the difference to inventory', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 9, roastedWeightKg: 8 }), routeParams)
      expect(response.status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { remainingWeightKg: { increment: 1 } },
      })
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
      const body = await response.json()
      expect(body.roastBatch.roasterInventory).toEqual({
        id: 'inv-1',
        claimedWeightKg: 50,
        remainingWeightKg: 28,
      })
    })

    test('the dialog payload with no level and no flavour tags saves nulls verbatim', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      // Exactly what RoastDetailsModal sends for an untouched roast: roastDate
      // is omitted when unchanged, nulls clear the level and the tags.
      const response = await PUT(
        putRequest({
          batchSizeKg: 10,
          roastedWeightKg: 8.5,
          roastLevel: null,
          roastProfileNotes: '',
          flavorNotes: null,
          expectedUpdatedAt: existingUpdatedAt.toISOString(),
        }),
        routeParams,
      )
      expect(response.status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.roasterInventoryItem.update).not.toHaveBeenCalled()
      expect(mockPrisma.roastBatch.updateMany.mock.calls[0][0].data).toEqual({
        batchSizeKg: 10,
        roastedWeightKg: 8.5,
        yieldPercentage: 85,
        weightLossPct: 15,
        roastLevel: null,
        roastProfileNotes: 'No notes',
        flavorNotes: null,
      })
    })

    test('409 when the form was opened before someone else changed the roast', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(
        putRequest({ batchSizeKg: 12, expectedUpdatedAt: '2026-09-20T09:00:00.000Z' }),
        routeParams,
      )
      expect(response.status).toBe(409)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
    })

    test('notes-only edits leave inventory alone', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(
        putRequest({ roastProfileNotes: '  ', flavorNotes: 'Honey, Citrus' }),
        routeParams,
      )
      expect(response.status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.roasterInventoryItem.update).not.toHaveBeenCalled()
      expect(mockPrisma.roastBatch.updateMany.mock.calls[0][0].data).toMatchObject({
        roastProfileNotes: 'No notes',
        flavorNotes: 'Honey, Citrus',
      })
    })

    test('400 when inventory cannot cover the larger batch', async () => {
      mockAuthUser = roaster
      mockPrisma.roasterInventoryItem.updateMany.mockResolvedValueOnce({ count: 0 })
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 500 }), routeParams)
      expect(response.status).toBe(400)
    })

    test('400 when roasted weight exceeds the batch', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastedWeightKg: 11 }), routeParams)
      expect(response.status).toBe(400)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
    })

    test('400 for a weight that is not a number, instead of ignoring it', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 'abc' }), routeParams)
      expect(response.status).toBe(400)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
    })

    test('rounds a float-noisy delta so a batch the stock can cover is accepted', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      // 10.3 - 10 is 0.3000000000000007 in floating point.
      const response = await PUT(putRequest({ batchSizeKg: 10.3, roastedWeightKg: 8 }), routeParams)
      expect(response.status).toBe(200)
      expect(mockPrisma.roasterInventoryItem.updateMany.mock.calls[0][0].data).toEqual({
        remainingWeightKg: { decrement: 0.3 },
      })
    })

    test('400 when the roasted weight is cleared, so yield never goes stale', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastedWeightKg: null }), routeParams)
      expect(response.status).toBe(400)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
    })

    test('400 for a malformed JSON body', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const request = new NextRequest('http://localhost:3001/api/roast-batches/roast-1', {
        method: 'PUT',
        body: '{bad json',
      })
      const response = await PUT(request, routeParams)
      expect(response.status).toBe(400)
    })

    test('404 when the roast disappears between the update and the read-back', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findUnique
        .mockResolvedValueOnce(existingRoast)
        .mockResolvedValueOnce(null)
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastLevel: 'Dark' }), routeParams)
      expect(response.status).toBe(404)
    })

    test('400 for a roast date in the future', async () => {
      mockAuthUser = roaster
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastDate: '2999-01-01' }), routeParams)
      expect(response.status).toBe(400)
    })

    test('409 when the roast changed underneath the edit', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.updateMany.mockResolvedValueOnce({ count: 0 })
      mockPrisma.roastBatch.findUnique
        .mockResolvedValueOnce(existingRoast)
        .mockResolvedValueOnce({ updatedAt: new Date('2026-09-20T11:00:00.000Z'), soldWeightKg: 0 })
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12 }), routeParams)
      expect(response.status).toBe(409)
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
    })

    test('400 when the roasted weight would drop below the kg already sold', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findUnique.mockResolvedValueOnce({ ...existingRoast, soldWeightKg: 3.5 })
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastedWeightKg: 3 }), routeParams)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('3.5 kg already sold')
      // Shown inline by the roast dialog, not treated as a stale form.
      expect(body.error).not.toMatch(/changed or removed by someone else|^Roast batch not found$/)
      expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
    })

    test('the roasted weight may equal the kg already sold', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findUnique.mockResolvedValueOnce({ ...existingRoast, soldWeightKg: 8 })
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ roastedWeightKg: 8 }), routeParams)
      expect(response.status).toBe(200)
      expect(mockPrisma.roastBatch.updateMany.mock.calls[0][0].where.soldWeightKg).toEqual({
        lte: 8 + 1e-6,
      })
    })

    test('400, not 409, when a sale took the kg after the roast was read', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.updateMany.mockResolvedValueOnce({ count: 0 })
      mockPrisma.roastBatch.findUnique
        .mockResolvedValueOnce(existingRoast)
        // Same updatedAt (sales never bump it), but 9.2 kg are sold now.
        .mockResolvedValueOnce({ updatedAt: existingUpdatedAt, soldWeightKg: 9.2 })
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12, roastedWeightKg: 9 }), routeParams)
      expect(response.status).toBe(400)
      expect((await response.json()).error).toContain('9.2 kg already sold')
      expect(mockPrisma.roasterInventoryItem.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/roast-batches/[id]', () => {
    test("403 when a roaster deletes someone else's roast", async () => {
      mockAuthUser = otherRoaster
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(403)
      expect(mockPrisma.roastBatch.delete).not.toHaveBeenCalled()
    })

    test('404 when the roast does not exist', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.findUnique.mockResolvedValueOnce(null)
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(404)
    })

    test('deletes the roast and returns its green beans to inventory', async () => {
      mockAuthUser = roaster
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(200)
      expect(mockPrisma.roastBatch.delete).toHaveBeenCalledWith({ where: { id: 'roast-1' } })
      expect(mockPrisma.roasterInventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: { remainingWeightKg: { increment: 10 } },
        }),
      )
      const body = await response.json()
      expect(body.updatedInventory).toEqual({
        id: 'inv-1',
        claimedWeightKg: 50,
        remainingWeightKg: 30,
      })
      expect(body.message).toBe('Roast batch deleted successfully')
    })

    test('409 naming the sales when the roast is on a sale', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrderItem.findMany.mockResolvedValueOnce([
        { saleOrder: { orderNumber: 'ORD-2026-0001' } },
      ])
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toContain('ORD-2026-0001')
      expect(body.error).not.toContain('…')
      expect(mockPrisma.saleOrderItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { roastBatchId: 'roast-1' }, take: 6 }),
      )
      expect(mockPrisma.roastBatch.delete).not.toHaveBeenCalled()
      expect(mockPrisma.roasterInventoryItem.update).not.toHaveBeenCalled()
    })

    test('lists at most five sales, then an ellipsis', async () => {
      mockAuthUser = roaster
      mockPrisma.saleOrderItem.findMany.mockResolvedValueOnce(
        [1, 2, 3, 4, 5, 6].map((n) => ({ saleOrder: { orderNumber: `ORD-2026-000${n}` } })),
      )
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toContain('ORD-2026-0005, …')
      expect(body.error).not.toContain('ORD-2026-0006')
    })

    test('409 when a sale takes the roast between the check and the delete', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.delete.mockRejectedValueOnce(
        Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }),
      )
      mockPrisma.saleOrderItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ saleOrder: { orderNumber: 'ORD-2026-0002' } }])
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain('ORD-2026-0002')
      expect(mockPrisma.roasterInventoryItem.update).not.toHaveBeenCalled()
    })

    test('a repeated delete does not return the beans twice', async () => {
      mockAuthUser = roaster
      mockPrisma.roastBatch.delete.mockRejectedValueOnce(
        Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' }),
      )
      const { DELETE } = await import('@/app/api/roast-batches/[id]/route')
      const response = await DELETE(deleteRequest(), routeParams)
      expect(response.status).toBe(404)
      expect(mockPrisma.roasterInventoryItem.update).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/roast-batches', () => {
    // Real v4 UUIDs: the create schema validates the ids.
    const INV = '2c8e7d10-3f4a-4b5c-8d6e-7f8091a2b3c4'
    const LOT = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
    const OTHER_LOT = 'b4cc29af-9c0a-4999-8a23-bdf5f7654113'
    // roaster-1's stock row.
    const stock = {
      id: INV,
      roasterId: 'roaster-1',
      greenBeanLotId: LOT,
      claimedWeightKg: 50,
      remainingWeightKg: 30,
    }
    const postRequest = (over: Record<string, unknown> = {}) =>
      new NextRequest('http://localhost:3001/api/roast-batches', {
        method: 'POST',
        body: JSON.stringify({
          roasterInventoryId: INV,
          greenBeanLotId: LOT,
          batchSizeKg: 10,
          yieldPercentage: 85,
          roastedWeightKg: 8.5,
          roastProfileNotes: 'No notes',
          ...over,
        }),
      })

    beforeEach(() => {
      mockPrisma.roasterInventoryItem.findUnique.mockResolvedValue(stock)
      mockPrisma.roastBatch.create.mockResolvedValue({ id: 'roast-1' })
    })

    test("a roaster's roast of their own stock is theirs", async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest())
      expect(response.status).toBe(201)
      expect(mockPrisma.roasterInventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: INV, remainingWeightKg: { gte: 10 - 1e-6 } },
        data: { remainingWeightKg: { decrement: 10 } },
      })
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data).toMatchObject({
        roasterId: 'roaster-1',
        roasterInventoryId: INV,
        greenBeanLotId: LOT,
        batchSizeKg: 10,
        roastedWeightKg: 8.5,
        yieldPercentage: 85,
        weightLossPct: 15,
      })
    })

    test.each([
      ['an Admin', admin],
      ['a super admin', superAdmin],
    ])("%s roasting a roaster's stock records the roast under that roaster", async (_who, user) => {
      mockAuthUser = user
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest())
      expect(response.status).toBe(201)
      // The beans come out of the roaster's row and the roast lands in their
      // Roast Logbook, where they can edit, delete and sell it.
      expect(mockPrisma.roasterInventoryItem.updateMany.mock.calls[0][0].where.id).toBe(INV)
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data.roasterId).toBe('roaster-1')
    })

    test("an Admin roasting their own stock keeps the roast", async () => {
      mockAuthUser = admin
      mockPrisma.roasterInventoryItem.findUnique.mockResolvedValueOnce({ ...stock, roasterId: 'admin-1' })
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest())
      expect(response.status).toBe(201)
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data.roasterId).toBe('admin-1')
    })

    test("403 when a roaster roasts someone else's stock", async () => {
      mockAuthUser = otherRoaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest())
      expect(response.status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.roastBatch.create).not.toHaveBeenCalled()
    })

    test("400 when greenBeanLotId is not the stock row's lot, with no stock taken", async () => {
      // It would log the roast on another owner's lot: on that lot's public
      // trace, and as a roast that keeps the owner from deleting the lot.
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest({ greenBeanLotId: OTHER_LOT }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Green bean lot does not match the roaster inventory item')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.roastBatch.create).not.toHaveBeenCalled()
    })

    test("the roast always takes the stock row's lot; greenBeanLotId may be left out", async () => {
      mockAuthUser = admin
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest({ greenBeanLotId: undefined }))
      expect(response.status).toBe(201)
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data.greenBeanLotId).toBe(LOT)
    })

    test('400 when the roasted weight is more than the batch, with no stock taken', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest({ roastedWeightKg: 25 }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Roasted weight cannot exceed batch size')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.roastBatch.create).not.toHaveBeenCalled()
    })

    test('a roasted weight equal to the batch, give or take float noise, is accepted', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      // 0.3 - 0.1 is 0.19999999999999998.
      const response = await POST(postRequest({ batchSizeKg: 0.3 - 0.1, roastedWeightKg: 0.2 }))
      expect(response.status).toBe(201)
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data).toMatchObject({
        roastedWeightKg: 0.2,
        yieldPercentage: 100,
        weightLossPct: 0,
      })
    })

    test('400 when the roasted weight is missing', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest({ roastedWeightKg: undefined }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Roasted weight is required')
      expect(mockPrisma.roastBatch.create).not.toHaveBeenCalled()
    })

    test("yield and weight loss come from the weights, not the client's figures", async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(
        postRequest({ batchSizeKg: '12', roastedWeightKg: '10.2', yieldPercentage: 100, weightLossPct: 0 }),
      )
      expect(response.status).toBe(201)
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data).toMatchObject({
        batchSizeKg: 12,
        roastedWeightKg: 10.2,
        yieldPercentage: 85,
        weightLossPct: 15,
      })
    })

    test.each([
      ['a junk batch size', { batchSizeKg: 'abc' }],
      ['a negative batch size', { batchSizeKg: -1 }],
      ['a junk roasted weight', { roastedWeightKg: 'abc' }],
      ['a roast level outside the list', { roastLevel: 'Burnt' }],
      ['a stock row id that is not a uuid', { roasterInventoryId: 'inv-1' }],
    ])('400 for %s, before reading the stock row', async (_name, over) => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest(over))
      expect(response.status).toBe(400)
      expect(mockPrisma.roasterInventoryItem.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.roastBatch.create).not.toHaveBeenCalled()
    })

    test('the batch is stored and taken from stock in kg to 2 dp, as the PUT rounds it', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest({ batchSizeKg: 10.0051, roastedWeightKg: 8 }))
      expect(response.status).toBe(201)
      expect(mockPrisma.roasterInventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: INV, remainingWeightKg: { gte: 10.01 - 1e-6 } },
        data: { remainingWeightKg: { decrement: 10.01 } },
      })
      expect(mockPrisma.roastBatch.create.mock.calls[0][0].data.batchSizeKg).toBe(10.01)
    })

    test('400 for a batch under 0.01 kg, which would round to nothing', async () => {
      mockAuthUser = roaster
      const { POST } = await import('@/app/api/roast-batches/route')
      const response = await POST(postRequest({ batchSizeKg: 0.004, roastedWeightKg: 0.003 }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('Batch size must be at least 0.01 kg')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('log, save unchanged and delete a roast: the stock ends where it started', async () => {
      // Unrounded, 10.0051 kg came off the shelf, the edit rounded the batch
      // to 10.01 without moving the 0.0049 kg, and the delete put back 10.01:
      // green beans out of nothing on every round trip.
      mockAuthUser = roaster
      let remaining = 30
      let row: any = null
      mockPrisma.roasterInventoryItem.updateMany.mockImplementation(async ({ where, data }: any) => {
        if (remaining < where.remainingWeightKg.gte) return { count: 0 }
        remaining -= data.remainingWeightKg.decrement
        return { count: 1 }
      })
      mockPrisma.roasterInventoryItem.update.mockImplementation(async ({ data }: any) => {
        remaining += data.remainingWeightKg.increment
        return { id: INV, claimedWeightKg: 50, remainingWeightKg: remaining }
      })
      mockPrisma.roastBatch.create.mockImplementation(async ({ data }: any) => {
        row = { id: 'roast-1', updatedAt: existingUpdatedAt, soldWeightKg: 0, ...data }
        return row
      })
      mockPrisma.roastBatch.findUnique.mockImplementation(async () => row)
      mockPrisma.roastBatch.updateMany.mockImplementation(async ({ data }: any) => {
        row = { ...row, ...data }
        return { count: 1 }
      })
      mockPrisma.roastBatch.delete.mockImplementation(async () => row)
      try {
        const routes = await import('@/app/api/roast-batches/route')
        const byId = await import('@/app/api/roast-batches/[id]/route')
        expect((await routes.POST(postRequest({ batchSizeKg: 10.0051, roastedWeightKg: 8 }))).status).toBe(201)
        expect((await byId.PUT(putRequest({}), routeParams)).status).toBe(200)
        expect((await byId.DELETE(deleteRequest(), routeParams)).status).toBe(200)
        expect(remaining).toBeCloseTo(30, 6)
      } finally {
        mockPrisma.roasterInventoryItem.update.mockImplementation(async () => ({
          id: 'inv-1', claimedWeightKg: 50, remainingWeightKg: 30,
        }))
      }
    })
  })
})
