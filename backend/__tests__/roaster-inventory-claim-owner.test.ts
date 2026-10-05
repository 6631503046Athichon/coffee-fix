/**
 * POST /api/roaster-inventory (claim): whose stock row the kg go into.
 *
 * A purchased (External) lot is its buyer's. Start roast and Sell on a
 * purchased lot first claim the kg, so when an Admin does that on a
 * roaster's purchased lot the kg must go into that roaster's stock row (and
 * the roast logged from it is then the roaster's too). Before, they went
 * into an Admin stock row the roaster never saw, which also blocked the
 * roaster's Delete of the lot. Every other claim fills the caller's own
 * stock.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

type Row = Record<string, any>

const mockTables: Record<string, Row[]> = {
  roasterInventoryItem: [],
  greenBeanLot: [],
}

function mockMatches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'roasterId_greenBeanLotId') {
      return row.roasterId === cond.roasterId && row.greenBeanLotId === cond.greenBeanLotId
    }
    if (cond && typeof cond === 'object') {
      if (!('gte' in cond)) throw new Error(`unsupported filter on ${key}`)
      return row[key] >= cond.gte
    }
    return row[key] === cond
  })
}

function mockApply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (value && typeof value === 'object' && 'increment' in value) row[key] = row[key] + value.increment
    else if (value && typeof value === 'object' && 'decrement' in value) row[key] = row[key] - value.decrement
    else row[key] = value
  }
}

function mockModel(name: string) {
  const rows = () => mockTables[name]
  return {
    findUnique: jest.fn(async ({ where }: any) => {
      const row = rows().find(r => mockMatches(r, where))
      return row ? { ...row } : null
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows().filter(r => mockMatches(r, where))
      hit.forEach(r => mockApply(r, data))
      return { count: hit.length }
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows().find(r => mockMatches(r, where))
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
      mockApply(row, data)
      return { ...row }
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `${name}-${rows().length + 1}`, ...data }
      rows().push(row)
      return { ...row }
    }),
  }
}

const mockPrisma: any = {
  roasterInventoryItem: mockModel('roasterInventoryItem'),
  greenBeanLot: mockModel('greenBeanLot'),
  $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
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
  handleApiError: jest.fn((error: any) => {
    const status = error.message === 'Unauthorized' ? 401 : error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const otherRoaster = { id: 'roaster-2', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isSuperAdmin: true }

const LOT = 'a3bb189e-8bf9-4888-9912-ace4e6543002'

const claim = async (claimedWeightKg: number) => {
  const { POST } = await import('@/app/api/roaster-inventory/route')
  return POST(
    new NextRequest('http://localhost:3001/api/roaster-inventory', {
      method: 'POST',
      body: JSON.stringify({ greenBeanLotId: LOT, claimedWeightKg }),
    }),
  )
}

const seedLot = (sourceType: 'External' | 'Internal', createdById: string | null) => {
  mockTables.greenBeanLot.push({
    id: LOT,
    sourceType,
    createdById,
    currentWeightKg: 10,
    availabilityStatus: 'Available',
  })
}

const lotKg = () => mockTables.greenBeanLot[0].currentWeightKg

beforeEach(() => {
  jest.clearAllMocks()
  mockTables.roasterInventoryItem = []
  mockTables.greenBeanLot = []
  mockAuthUser = roaster
})

describe('POST /api/roaster-inventory: whose stock a claim fills', () => {
  test("an Admin's claim of a roaster's purchased lot goes into that roaster's stock row", async () => {
    seedLot('External', 'roaster-1')
    mockAuthUser = admin

    const response = await claim(2)
    expect(response.status).toBe(201)
    expect(mockTables.roasterInventoryItem).toHaveLength(1)
    expect(mockTables.roasterInventoryItem[0]).toMatchObject({
      roasterId: 'roaster-1',
      greenBeanLotId: LOT,
      claimedWeightKg: 2,
      remainingWeightKg: 2,
    })
    expect((await response.json()).inventoryItem.roasterId).toBe('roaster-1')
    expect(lotKg()).toBe(8)
  })

  test("an Admin's claim tops up the roaster's existing stock row, never a second Admin row", async () => {
    seedLot('External', 'roaster-1')
    mockTables.roasterInventoryItem.push({
      id: 'stock-1',
      roasterId: 'roaster-1',
      greenBeanLotId: LOT,
      claimedWeightKg: 3,
      remainingWeightKg: 1,
    })
    mockAuthUser = admin

    expect((await claim(2)).status).toBe(201)
    expect(mockTables.roasterInventoryItem).toHaveLength(1)
    expect(mockTables.roasterInventoryItem[0]).toMatchObject({
      id: 'stock-1',
      roasterId: 'roaster-1',
      claimedWeightKg: 5,
      remainingWeightKg: 3,
    })
  })

  test('a super admin counts as an Admin here too', async () => {
    seedLot('External', 'roaster-1')
    mockAuthUser = superAdmin

    expect((await claim(1)).status).toBe(201)
    expect(mockTables.roasterInventoryItem[0].roasterId).toBe('roaster-1')
  })

  test("an Admin's claim of their own purchased lot, or of one with no buyer on record, is their own", async () => {
    seedLot('External', 'admin-1')
    mockAuthUser = admin
    expect((await claim(1)).status).toBe(201)
    expect(mockTables.roasterInventoryItem[0].roasterId).toBe('admin-1')

    mockTables.roasterInventoryItem = []
    mockTables.greenBeanLot = []
    seedLot('External', null)
    expect((await claim(1)).status).toBe(201)
    expect(mockTables.roasterInventoryItem[0].roasterId).toBe('admin-1')
  })

  test("an Admin's claim of an Internal (processed) lot is still the Admin's own", async () => {
    seedLot('Internal', 'processor-1')
    mockAuthUser = admin

    expect((await claim(1)).status).toBe(201)
    expect(mockTables.roasterInventoryItem[0].roasterId).toBe('admin-1')
  })

  test("a roaster's claim of their own purchased lot, or of an Internal lot, is their own", async () => {
    seedLot('External', 'roaster-1')
    expect((await claim(1)).status).toBe(201)
    expect(mockTables.roasterInventoryItem[0].roasterId).toBe('roaster-1')

    mockTables.roasterInventoryItem = []
    mockTables.greenBeanLot = []
    seedLot('Internal', 'processor-1')
    expect((await claim(1)).status).toBe(201)
    expect(mockTables.roasterInventoryItem[0].roasterId).toBe('roaster-1')
  })

  test("another roaster still cannot claim a roaster's purchased lot", async () => {
    seedLot('External', 'roaster-1')
    mockAuthUser = otherRoaster

    const response = await claim(1)
    expect(response.status).toBe(403)
    expect(mockTables.roasterInventoryItem).toHaveLength(0)
    expect(lotKg()).toBe(10)
  })
})
