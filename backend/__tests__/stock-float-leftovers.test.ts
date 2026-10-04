/**
 * F34: float leftovers must not block roasting or claiming the last kilos.
 *
 * Postgres stores kg as double precision, so 5 - 4 x 1.2 leaves
 * 0.19999999999999973, not 0.2. POST /api/roast-batches and
 * POST /api/roaster-inventory (claim) compare with WEIGHT_EPSILON of slack and
 * store what is left rounded to 6 decimals (never below 0), like the sale
 * routes in lib/saleOrders.ts do.
 *
 * The fake tables below do the arithmetic in JS doubles, which is what
 * Postgres does with a double precision column.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

type Row = Record<string, any>

const mockTables: Record<string, Row[]> = {
  roasterInventoryItem: [],
  greenBeanLot: [],
  roastBatch: [],
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
  roastBatch: mockModel('roastBatch'),
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
const INV = '2c8e7d10-3f4a-4b5c-8d6e-7f8091a2b3c4'
const LOT = 'a3bb189e-8bf9-4888-9912-ace4e6543002'

// What 5 kg minus four 1.2 kg takes leaves in a double precision column.
const LEFTOVER = 5 - 1.2 - 1.2 - 1.2 - 1.2

const stockRow = () => mockTables.roasterInventoryItem.find(r => r.id === INV)!
const lotRow = () => mockTables.greenBeanLot.find(r => r.id === LOT)!

beforeEach(() => {
  jest.clearAllMocks()
  mockTables.roasterInventoryItem = []
  mockTables.greenBeanLot = []
  mockTables.roastBatch = []
  mockAuthUser = roaster
})

test('the leftover really is below 0.2 (what the fixes are for)', () => {
  expect(LEFTOVER).toBe(0.19999999999999973)
  expect(LEFTOVER < 0.2).toBe(true)
})

describe('POST /api/roast-batches with float leftovers', () => {
  const roast = async (batchSizeKg: number, roastedWeightKg: number) => {
    const { POST } = await import('@/app/api/roast-batches/route')
    return POST(
      new NextRequest('http://localhost:3001/api/roast-batches', {
        method: 'POST',
        body: JSON.stringify({ roasterInventoryId: INV, batchSizeKg, roastedWeightKg }),
      }),
    )
  }

  const seedStock = (remainingWeightKg: number) => {
    mockTables.roasterInventoryItem.push({
      id: INV,
      roasterId: 'roaster-1',
      greenBeanLotId: LOT,
      claimedWeightKg: 5,
      remainingWeightKg,
    })
  }

  test('four 1.2 kg roasts of a 5 kg row leave exactly 0.2 kg, and the last 0.2 kg can be roasted', async () => {
    seedStock(5)
    for (let i = 0; i < 4; i++) {
      expect((await roast(1.2, 1)).status).toBe(201)
    }
    expect(stockRow().remainingWeightKg).toBe(0.2)

    const last = await roast(0.2, 0.17)
    expect(last.status).toBe(201)
    expect(stockRow().remainingWeightKg).toBe(0)
    expect(mockTables.roastBatch).toHaveLength(5)
  })

  test('a row already holding a leftover (0.1999...) still roasts its last 0.2 kg, leaving 0, not -2.7e-16', async () => {
    seedStock(LEFTOVER)
    const response = await roast(0.2, 0.17)
    expect(response.status).toBe(201)
    expect(stockRow().remainingWeightKg).toBe(0)
    expect(Object.is(stockRow().remainingWeightKg, -0)).toBe(false)
  })

  test('the slack is a hair, not a real overdraw: 0.21 kg from 0.2 kg is refused with nothing taken', async () => {
    seedStock(0.2)
    const response = await roast(0.21, 0.18)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Insufficient weight in inventory')
    expect(stockRow().remainingWeightKg).toBe(0.2)
    expect(mockTables.roastBatch).toHaveLength(0)
  })
})

describe('POST /api/roaster-inventory (claim) with float leftovers', () => {
  const claim = async (claimedWeightKg: number) => {
    const { POST } = await import('@/app/api/roaster-inventory/route')
    return POST(
      new NextRequest('http://localhost:3001/api/roaster-inventory', {
        method: 'POST',
        body: JSON.stringify({ greenBeanLotId: LOT, claimedWeightKg }),
      }),
    )
  }

  // The claim creates the roaster's stock row (one per roaster and lot).
  const stockRow = () => mockTables.roasterInventoryItem[0]

  const seedLot = (currentWeightKg: number) => {
    mockTables.greenBeanLot.push({ id: LOT, currentWeightKg, availabilityStatus: 'Available' })
  }

  test('four 1.2 kg claims of a 5 kg lot leave exactly 0.2 kg, and the last 0.2 kg can be claimed', async () => {
    seedLot(5)
    for (let i = 0; i < 4; i++) {
      expect((await claim(1.2)).status).toBe(201)
    }
    expect(lotRow().currentWeightKg).toBe(0.2)

    const last = await claim(0.2)
    expect(last.status).toBe(201)
    expect(lotRow().currentWeightKg).toBe(0)
    expect(lotRow().availabilityStatus).toBe('Withdrawn')
    // The roaster's one stock row adds up to the whole lot, with no leftover.
    expect(mockTables.roasterInventoryItem).toHaveLength(1)
    expect(stockRow().claimedWeightKg).toBe(5)
    expect(stockRow().remainingWeightKg).toBe(5)
  })

  test('a lot already holding a leftover (0.1999...) can still be claimed to the last 0.2 kg', async () => {
    seedLot(LEFTOVER)
    const response = await claim(0.2)
    expect(response.status).toBe(201)
    expect(lotRow().currentWeightKg).toBe(0)
    expect(lotRow().availabilityStatus).toBe('Withdrawn')
    const body = await response.json()
    expect(body.updatedSourceLot.currentWeightKg).toBe(0)
  })

  test('a second claim on the same lot is stored rounded (0.7 + 0.1 is 0.8, not 0.7999...)', async () => {
    seedLot(5)
    expect((await claim(0.7)).status).toBe(201)
    expect((await claim(0.1)).status).toBe(201)
    expect(stockRow().claimedWeightKg).toBe(0.8)
    expect(stockRow().remainingWeightKg).toBe(0.8)
    expect(lotRow().currentWeightKg).toBe(4.2)
  })

  test('the slack is a hair, not a real overdraw: 0.21 kg from a 0.2 kg lot is refused with nothing taken', async () => {
    seedLot(0.2)
    const response = await claim(0.21)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Insufficient weight available')
    expect(lotRow().currentWeightKg).toBe(0.2)
    expect(lotRow().availabilityStatus).toBe('Available')
    expect(mockTables.roasterInventoryItem).toHaveLength(0)
  })
})
