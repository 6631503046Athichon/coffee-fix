/**
 * A farmer-only user (a Farmer with no staff role) used to read every
 * processor's chain through the API: GET /api/processing-batches,
 * /api/parchment-lots and /api/green-bean-lots, list and by id, returned
 * every farmer's batches, parchment and green beans. They now return only
 * the chain grown on farms the farmer owns or collaborates on, the rule
 * bulk-load already applied. Staff roles (multi-role included), Admins and
 * super admins still see every chain.
 *
 * GET /api/pricing-history listed every green-bean lot's price history to
 * any signed-in user, so a farmer could still read the prices of lots the
 * green-bean routes refuse them. It is scoped the same way.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARMER = 'farmer-1'
const OWN_FARM = 'farm-own'
const SHARED_FARM = 'farm-shared'
const OTHER_FARM = 'farm-other'

const mockPrisma: any = {
  farm: { findMany: jest.fn() },
  processingBatch: { findMany: jest.fn(), findUnique: jest.fn() },
  parchmentLot: { findMany: jest.fn(), findUnique: jest.fn() },
  greenBeanLot: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  pricingHistory: { findMany: jest.fn() },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Real role, ownership and error handling; only the session is faked.
let mockAuthUser: any = null
jest.mock('@/lib/middleware', () => {
  const actual = jest.requireActual('@/lib/middleware') as Record<string, unknown>
  return {
    ...actual,
    requireAuth: jest.fn(async () => {
      if (!mockAuthUser) throw new Error('Unauthorized')
      return mockAuthUser
    }),
  }
})

const user = (roles: string[], isSuperAdmin = false) => ({
  id: FARMER, email: null, username: null, name: 'Somchai', roles, isActive: true, isSuperAdmin,
})
const pureFarmer = user(['Farmer'])

// Everyone the farmer rule must leave alone.
const unscoped: [string, any][] = [
  ['a Processor', user(['Processor'])],
  ['a Roaster', user(['Roaster'])],
  ['a Cupper', user(['Cupper'])],
  ['a HeadJudge', user(['HeadJudge'])],
  ['a Farmer+Processor', user(['Farmer', 'Processor'])],
  ['an Admin', user(['Admin'])],
  ['a super admin who only holds Farmer', user(['Farmer'], true)],
]

const memberFarms = { farmId: { in: [OWN_FARM, SHARED_FARM] } }

const request = (url: string) => new NextRequest(`http://localhost:3001${url}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const whereOf = (model: any) => model.findMany.mock.calls[0][0].where

// One record of each kind, grown on `farmId` (null: bought in, no farm).
const batchOn = (farmId: string | null) => ({
  id: 'pb-1',
  harvestLotId: 'hl-1',
  createdById: 'processor-9',
  harvestLot: { id: 'hl-1', farmId, farm: farmId ? { id: farmId, farmName: 'Farm', location: 'Nan' } : null },
  parchmentLots: [],
  dryingLogs: [],
})
const parchmentOn = (farmId: string | null) => ({
  id: 'pl-1',
  processType: 'Washed',
  processingBatch: farmId ? { id: 'pb-1', createdById: 'processor-9' } : null,
  harvestLot: farmId ? { id: 'hl-1', farmerName: 'Someone', cherryVariety: 'Typica', farmId } : null,
  physicalTestResults: null,
  greenBeanLots: [],
})
const greenOn = (farmId: string | null) => ({
  id: 'gbl-1',
  grade: 'Grade A',
  createdById: 'processor-9',
  parchmentLot: farmId ? { id: 'pl-1', harvestLot: { id: 'hl-1', farmerName: 'Someone', cherryVariety: 'Typica', farmId } } : null,
  withdrawalHistory: [],
  roasterInventory: [],
  roastBatches: [],
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.farm.findMany.mockResolvedValue([{ id: OWN_FARM }, { id: SHARED_FARM }])
  mockPrisma.processingBatch.findMany.mockResolvedValue([])
  mockPrisma.parchmentLot.findMany.mockResolvedValue([])
  mockPrisma.greenBeanLot.findMany.mockResolvedValue([])
  mockPrisma.greenBeanLot.count.mockResolvedValue(0)
  mockPrisma.pricingHistory.findMany.mockResolvedValue([])
})

describe('lib/farmAccess chain helpers', () => {
  test('chainFarmIds: the farms a pure Farmer owns or collaborates on', async () => {
    const { chainFarmIds } = await import('@/lib/farmAccess')
    expect(await chainFarmIds(pureFarmer as any)).toEqual([OWN_FARM, SHARED_FARM])
    expect(mockPrisma.farm.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ ownerId: FARMER }, { collaborators: { some: { userId: FARMER } } }],
    })
  })

  test.each(unscoped)('chainFarmIds: no limit for %s', async (_label, viewer) => {
    const { chainFarmIds } = await import('@/lib/farmAccess')
    expect(await chainFarmIds(viewer)).toBeNull()
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })

  test('requireChainFarm lets a limited user through only on one of their farms', async () => {
    const { requireChainFarm } = await import('@/lib/farmAccess')
    expect(() => requireChainFarm(null, OTHER_FARM)).not.toThrow()
    expect(() => requireChainFarm(null, null)).not.toThrow()
    expect(() => requireChainFarm([OWN_FARM], OWN_FARM)).not.toThrow()
    expect(() => requireChainFarm([OWN_FARM], OTHER_FARM)).toThrow('Insufficient permissions')
    expect(() => requireChainFarm([OWN_FARM], null)).toThrow('Insufficient permissions')
    expect(() => requireChainFarm([], undefined)).toThrow('Insufficient permissions')
  })
})

describe('list routes', () => {
  const lists: [string, string, () => any, any][] = [
    ['GET /api/processing-batches', '/api/processing-batches', () => mockPrisma.processingBatch, { harvestLot: memberFarms }],
    ['GET /api/parchment-lots', '/api/parchment-lots', () => mockPrisma.parchmentLot, { harvestLot: memberFarms }],
    ['GET /api/green-bean-lots', '/api/green-bean-lots', () => mockPrisma.greenBeanLot, { parchmentLot: { harvestLot: memberFarms } }],
  ]
  const routeOf = async (url: string) => {
    if (url === '/api/processing-batches') return import('@/app/api/processing-batches/route')
    if (url === '/api/parchment-lots') return import('@/app/api/parchment-lots/route')
    return import('@/app/api/green-bean-lots/route')
  }
  const list = async (url: string) => {
    const { GET } = await routeOf(url.split('?')[0])
    const response = await GET(request(url))
    expect(response.status).toBe(200)
  }

  test.each(lists)('%s: a pure Farmer gets only their own and shared farms\' chain', async (_label, url, model, scope) => {
    mockAuthUser = pureFarmer
    await list(url)
    expect(whereOf(model())).toEqual(scope)
  })

  test("GET /api/green-bean-lots: a pure Farmer's page count is over the same scoped rows", async () => {
    mockAuthUser = pureFarmer
    await list('/api/green-bean-lots')
    expect(mockPrisma.greenBeanLot.count).toHaveBeenCalledWith({ where: whereOf(mockPrisma.greenBeanLot) })
  })

  test.each(
    lists.flatMap(([label, url, model]) =>
      unscoped.map(([who, viewer]): [string, string, string, () => any, any] => [label, who, url, model, viewer])),
  )('%s: %s gets every chain', async (_label, _who, url, model, viewer) => {
    mockAuthUser = viewer
    await list(url)
    expect(whereOf(model())).toEqual({})
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })

  test("a pure Farmer's query filters still apply inside their farms", async () => {
    mockAuthUser = pureFarmer
    await list('/api/processing-batches?harvestLotId=hl-1&status=Drying')
    expect(whereOf(mockPrisma.processingBatch)).toEqual({
      harvestLotId: 'hl-1',
      status: 'Drying',
      harvestLot: memberFarms,
    })
  })

  test('a pure Farmer with no farms gets nothing', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.farm.findMany.mockResolvedValue([])
    await list('/api/parchment-lots')
    expect(whereOf(mockPrisma.parchmentLot)).toEqual({ harvestLot: { farmId: { in: [] } } })
  })
})

describe('by-id routes', () => {
  type Open = (farmId: string | null) => Promise<Response>
  const routes: [string, Open][] = [
    ['GET /api/processing-batches/:id', async farmId => {
      mockPrisma.processingBatch.findUnique.mockResolvedValue(batchOn(farmId))
      const { GET } = await import('@/app/api/processing-batches/[id]/route')
      return GET(request('/api/processing-batches/pb-1'), params('pb-1'))
    }],
    ['GET /api/parchment-lots/:id', async farmId => {
      mockPrisma.parchmentLot.findUnique.mockResolvedValue(parchmentOn(farmId))
      const { GET } = await import('@/app/api/parchment-lots/[id]/route')
      return GET(request('/api/parchment-lots/pl-1'), params('pl-1'))
    }],
    ['GET /api/green-bean-lots/:id', async farmId => {
      mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenOn(farmId))
      const { GET } = await import('@/app/api/green-bean-lots/[id]/route')
      return GET(request('/api/green-bean-lots/gbl-1'), params('gbl-1'))
    }],
  ]

  test.each(routes)("%s: a pure Farmer gets 403 on another farmer's chain", async (_label, open) => {
    mockAuthUser = pureFarmer
    const response = await open(OTHER_FARM)
    expect(response.status).toBe(403)
  })

  test.each(routes)('%s: a pure Farmer gets 403 on stock from no farm', async (_label, open) => {
    mockAuthUser = pureFarmer
    const response = await open(null)
    expect(response.status).toBe(403)
  })

  test.each(routes)('%s: a pure Farmer opens the chain from a farm they own', async (_label, open) => {
    mockAuthUser = pureFarmer
    const response = await open(OWN_FARM)
    expect(response.status).toBe(200)
  })

  test.each(routes)('%s: a pure Farmer opens the chain from a farm shared with them', async (_label, open) => {
    mockAuthUser = pureFarmer
    const response = await open(SHARED_FARM)
    expect(response.status).toBe(200)
  })

  test.each(
    routes.flatMap(([label, open]) =>
      unscoped.map(([who, viewer]): [string, string, Open, any] => [label, who, open, viewer])),
  )("%s: %s opens another farmer's chain", async (_label, _who, open, viewer) => {
    mockAuthUser = viewer
    const response = await open(OTHER_FARM)
    expect(response.status).toBe(200)
  })

  test('the parchment and green-bean detail routes load the farm the check needs', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.parchmentLot.findUnique.mockResolvedValue(parchmentOn(OWN_FARM))
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenOn(OWN_FARM))
    const parchment = await import('@/app/api/parchment-lots/[id]/route')
    const green = await import('@/app/api/green-bean-lots/[id]/route')
    await parchment.GET(request('/api/parchment-lots/pl-1'), params('pl-1'))
    await green.GET(request('/api/green-bean-lots/gbl-1'), params('gbl-1'))
    expect(mockPrisma.parchmentLot.findUnique.mock.calls[0][0].include.harvestLot.select.farmId).toBe(true)
    expect(mockPrisma.greenBeanLot.findUnique.mock.calls[0][0].include.parchmentLot.include.harvestLot.select.farmId).toBe(true)
  })

  test('an unknown id is still 404 for a pure Farmer', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.processingBatch.findUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/processing-batches/[id]/route')
    const response = await GET(request('/api/processing-batches/nope'), params('nope'))
    expect(response.status).toBe(404)
  })
})

describe('GET /api/pricing-history', () => {
  const history = async (query = '') => {
    const { GET } = await import('@/app/api/pricing-history/route')
    const response = await GET(request(`/api/pricing-history${query}`))
    expect(response.status).toBe(200)
    return whereOf(mockPrisma.pricingHistory)
  }

  test("a pure Farmer gets only the prices of their own and shared farms' green beans", async () => {
    mockAuthUser = pureFarmer
    expect(await history()).toEqual({ greenBeanLot: { parchmentLot: { harvestLot: memberFarms } } })
  })

  test("a pure Farmer asking for another farm's lot by id still gets only their farms' rows", async () => {
    mockAuthUser = pureFarmer
    expect(await history('?greenBeanLotId=gbl-other')).toEqual({
      greenBeanLotId: 'gbl-other',
      greenBeanLot: { parchmentLot: { harvestLot: memberFarms } },
    })
  })

  test.each(unscoped)('%s gets the price history of every lot', async (_label, viewer) => {
    mockAuthUser = viewer
    expect(await history('?greenBeanLotId=gbl-1')).toEqual({ greenBeanLotId: 'gbl-1' })
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })
})
