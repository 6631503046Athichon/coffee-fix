/**
 * When an Admin gives a farm to another farmer, the farm's harvest lots go
 * with it. harvest-lots reads a lot's owner from createdById first (falling
 * back to the farm's owner), so PUT /api/farms/:id moves createdById in the
 * same transaction as the owner change. Otherwise the old owner would keep
 * editing lots they no longer see, and the new owner would get 403 on lots in
 * their own list.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARM_ID = '0b6f4c8e-3d2a-4f1b-9c7e-1a2b3c4d5e6f'
const LOT_ID = 'lot-123'
const FARMER_A = 'farmer-a'
const FARMER_B = 'farmer-b'

const farmerA = { id: FARMER_A, roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const farmerB = { id: FARMER_B, roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }

// One farm and one lot on it, as the database holds them.
let farmRow: { id: string; ownerId: string }
let lotRow: { createdById: string | null; farmId: string }

const mockPrisma: any = {
  farm: {
    findUnique: jest.fn(async () => farmRow),
    update: jest.fn(async (args: any) => {
      farmRow = { ...farmRow, ...args.data }
      return farmRow
    }),
  },
  harvestLot: {
    findUnique: jest.fn(async (args: any) => {
      if (args.include) return { id: LOT_ID, weightKg: 150, status: 'ReadyForProcessing', _count: { processingBatches: 0 } }
      return {
        ...lotRow,
        weightKg: 150,
        status: 'ReadyForProcessing',
        farm: { ownerId: farmRow.ownerId },
        _count: { processingBatches: 0, parchmentLots: 0 },
      }
    }),
    update: jest.fn(async () => ({ id: LOT_ID, weightKg: 150, status: 'ReadyForProcessing', _count: { processingBatches: 0 } })),
    updateMany: jest.fn(async (args: any) => {
      if (args.where.farmId === lotRow.farmId && args.data.createdById !== undefined) {
        lotRow = { ...lotRow, createdById: args.data.createdById }
        return { count: 1 }
      }
      return { count: 0 }
    }),
  },
  $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
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
  requireRole: jest.fn(),
  requireOwnership: jest.fn((user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
    if (user.isSuperAdmin) return
    if (user.roles.some((role: string) => allowedRoles.includes(role))) return
    if (!ownerId || user.id !== ownerId) throw new Error('Insufficient permissions')
  }),
  handleApiError: jest.fn((error: any) => {
    const status = error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

async function putFarm(body: Record<string, unknown>) {
  const { PUT } = await import('@/app/api/farms/[id]/route')
  const response = await PUT(
    new NextRequest(`http://localhost:3001/api/farms/${FARM_ID}`, { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: FARM_ID }) },
  )
  return { status: response.status, data: await response.json() }
}

async function putLot(body: Record<string, unknown>) {
  const { PUT } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await PUT(
    new NextRequest(`http://localhost:3001/api/harvest-lots/${LOT_ID}`, { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: LOT_ID }) },
  )
  return response.status
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  farmRow = { id: FARM_ID, ownerId: FARMER_A }
  lotRow = { createdById: FARMER_A, farmId: FARM_ID }
})

describe('PUT /api/farms/:id moves the farm\'s lots with a new owner', () => {
  test.each([
    ['Admin', admin],
    ['super admin who is an Admin', { ...superAdmin, roles: ['Admin'] }],
  ])('an %s giving the farm to another farmer moves its lots in the same transaction', async (_label, user) => {
    mockAuthUser = user

    const { status, data } = await putFarm({ ownerId: FARMER_B })

    expect(status).toBe(200)
    expect(data.farm.ownerId).toBe(FARMER_B)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
      where: { farmId: FARM_ID },
      data: { createdById: FARMER_B },
    })
    expect(lotRow.createdById).toBe(FARMER_B)
  })

  test('afterwards the new owner can edit the lot and the old owner cannot', async () => {
    mockAuthUser = admin
    await putFarm({ ownerId: FARMER_B })

    mockAuthUser = farmerB
    expect(await putLot({ cherryVariety: 'Typica' })).toBe(200)
    mockAuthUser = farmerA
    expect(await putLot({ cherryVariety: 'Geisha' })).toBe(403)
  })

  test('an edit that keeps the owner leaves the lots alone', async () => {
    mockAuthUser = farmerA

    const first = await putFarm({ farmName: 'Doi Farm' })
    const sameOwner = await putFarm({ farmName: 'Doi Farm', ownerId: FARMER_A })

    expect(first.status).toBe(200)
    expect(sameOwner.status).toBe(200)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    expect(lotRow.createdById).toBe(FARMER_A)
  })

  test('a farmer cannot give their farm away, and the lots stay theirs', async () => {
    mockAuthUser = farmerA

    const { status } = await putFarm({ ownerId: FARMER_B })

    expect(status).toBe(403)
    expect(mockPrisma.farm.update).not.toHaveBeenCalled()
    expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    expect(lotRow.createdById).toBe(FARMER_A)
  })
})
