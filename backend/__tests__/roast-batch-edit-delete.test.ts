/**
 * PUT / DELETE /api/roast-batches/[id]
 * Ownership checks and the inventory bookkeeping that goes with correcting
 * or removing a roast.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  roastBatch: {
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 1 })),
    delete: jest.fn(),
  },
  roasterInventoryItem: {
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async () => ({ id: 'inv-1', claimedWeightKg: 50, remainingWeightKg: 30 })),
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

const existingUpdatedAt = new Date('2026-09-20T10:00:00.000Z')
const existingRoast = {
  id: 'roast-1',
  updatedAt: existingUpdatedAt,
  roasterId: 'roaster-1',
  roasterInventoryId: 'inv-1',
  greenBeanLotId: 'lot-1',
  batchSizeKg: 10,
  roastedWeightKg: 8.5,
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
      expect(update.where).toEqual({ id: 'roast-1', updatedAt: existingUpdatedAt })
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
      const { PUT } = await import('@/app/api/roast-batches/[id]/route')
      const response = await PUT(putRequest({ batchSizeKg: 12 }), routeParams)
      expect(response.status).toBe(409)
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
})
