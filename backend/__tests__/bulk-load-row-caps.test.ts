/**
 * F13: bulk-load phase 2 used to cap soil (100), GAP (100), processing
 * batches (50) and parchment (100) rows. The pages build their tables,
 * reports and CSVs from these lists, so anything past the cap vanished:
 * older parchment awaiting hulling could not be Hull & Graded, green beans
 * from it grouped as "Unknown", the Batch column made up PB ids, and the GAP
 * report was silently incomplete. The lists are now whole; each role's
 * scoping still bounds them, and their nested rows are cut to what the
 * client reads.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// More rows than any of the old caps.
const ROWS = 160

const rows = (prefix: string) =>
  Array.from({ length: ROWS }, (_, i) => ({ id: `${prefix}-${i + 1}` }))

// A findMany that honours `take` the way Prisma does, so a cap shows up as
// missing rows in the response rather than only as a query argument.
const listOf = (data: { id: string }[]) =>
  jest.fn(async (args: any) => (args?.take === undefined ? data : data.slice(0, args.take)))

const SOIL = rows('soil')
const GAP = rows('gap')
const BATCHES = rows('pb')
// Newest first, as the route orders them: the oldest parchment, still
// awaiting hulling, is last.
const PARCHMENT = rows('pl').map((lot, i) => ({
  ...lot,
  status: i === ROWS - 1 ? 'AwaitingHulling' : 'Hulled',
}))

const mockPrisma: any = {
  farm: { findMany: jest.fn(async () => [{ id: 'farm-1' }]) },
  soilAnalysis: { findMany: listOf(SOIL) },
  weatherRecord: { findMany: jest.fn(async () => []) },
  gAPLogEntry: { findMany: listOf(GAP) },
  processingBatch: { findMany: listOf(BATCHES) },
  parchmentLot: { findMany: listOf(PARCHMENT) },
  greenBeanLot: { findMany: jest.fn(async () => []) },
  roasterInventoryItem: { findMany: jest.fn(async () => []) },
  roastBatch: { findMany: jest.fn(async () => []) },
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
  requireOwnership: jest.fn(),
  handleApiError: jest.fn((error: any) => {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const user = (id: string, roles: string[], isSuperAdmin = false) => ({ id, roles, isSuperAdmin })
const processor = user('processor-1', ['Processor'])
const farmer = user('farmer-1', ['Farmer'])
const admin = user('admin-1', ['Admin'])

const phase2 = async () => {
  const { GET } = await import('@/app/api/bulk-load/route')
  const response = await GET(new NextRequest('http://localhost:3001/api/bulk-load?phase=2'))
  expect(response.status).toBe(200)
  return response.json()
}

const argsOf = (model: any) => model.findMany.mock.calls[0][0]

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
})

describe('bulk-load phase 2 returns every row the pages need (F13)', () => {
  test.each([
    ['Processor', processor],
    ['Admin', admin],
  ])('a %s gets all parchment lots, including the oldest one still awaiting hulling', async (_role, viewer) => {
    mockAuthUser = viewer
    const body = await phase2()
    expect(body.parchmentLots).toHaveLength(ROWS)
    expect(body.parchmentLots[ROWS - 1]).toEqual({ id: `pl-${ROWS}`, status: 'AwaitingHulling' })
  })

  test('a Processor gets every processing batch, so loaded lots never point at an unloaded batch', async () => {
    mockAuthUser = processor
    const body = await phase2()
    expect(body.processingBatches).toHaveLength(ROWS)
    expect(body.processingBatches.map((b: any) => b.id)).toContain(`pb-${ROWS}`)
  })

  test('a Farmer gets every soil analysis and GAP log on their farms', async () => {
    mockAuthUser = farmer
    const body = await phase2()
    expect(body.soilAnalyses).toHaveLength(ROWS)
    expect(body.gapLogs).toHaveLength(ROWS)
  })

  test('none of the four lists is capped', async () => {
    mockAuthUser = admin
    await phase2()
    for (const model of [
      mockPrisma.soilAnalysis,
      mockPrisma.gAPLogEntry,
      mockPrisma.processingBatch,
      mockPrisma.parchmentLot,
    ]) {
      expect(argsOf(model).take).toBeUndefined()
    }
  })
})

describe('bulk-load phase 2 keeps the uncapped lists light', () => {
  test('green-bean lots nest only their parchment lot\'s process type', async () => {
    mockAuthUser = processor
    await phase2()
    expect(argsOf(mockPrisma.greenBeanLot).include.parchmentLot).toEqual({
      select: {
        processType: true,
        processingBatch: { select: { processType: true } },
      },
    })
  })

  test('batches and parchment lots nest nothing the client drops', async () => {
    mockAuthUser = admin
    await phase2()
    expect(Object.keys(argsOf(mockPrisma.processingBatch).include)).toEqual(['dryingLogs'])
    expect(Object.keys(argsOf(mockPrisma.parchmentLot).include)).toEqual(['physicalTestResults'])
  })
})

describe('bulk-load phase 2 keeps each role\'s scoping', () => {
  test('a Farmer\'s lists stay limited to the farms they own or share', async () => {
    mockAuthUser = farmer
    await phase2()
    const farmScope = { farmId: { in: ['farm-1'] } }
    expect(argsOf(mockPrisma.soilAnalysis).where).toEqual(farmScope)
    expect(argsOf(mockPrisma.gAPLogEntry).where).toEqual(farmScope)
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({ harvestLot: farmScope })
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({ harvestLot: farmScope })
  })

  test('a Processor sees soil and GAP only for farms they are a member of', async () => {
    mockAuthUser = processor
    await phase2()
    expect(argsOf(mockPrisma.soilAnalysis).where).toEqual({ farmId: { in: ['farm-1'] } })
    expect(argsOf(mockPrisma.gAPLogEntry).where).toEqual({ farmId: { in: ['farm-1'] } })
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({})
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({})
  })

  test('an Admin is not scoped', async () => {
    mockAuthUser = admin
    await phase2()
    expect(argsOf(mockPrisma.soilAnalysis).where).toEqual({})
    expect(argsOf(mockPrisma.gAPLogEntry).where).toEqual({})
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })
})
