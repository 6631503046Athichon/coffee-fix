/**
 * A farmer-only user (a Farmer with no other role) used to read every
 * processor's chain through the API: GET /api/processing-batches,
 * /api/parchment-lots and /api/green-bean-lots, list and by id, returned
 * every farmer's batches, parchment and green beans. They return only the
 * chain grown on farms the farmer owns or collaborates on, the rule bulk-load
 * already applied.
 *
 * GET /api/pricing-history listed every green-bean lot's price history to
 * any signed-in user, so a farmer could still read the prices of lots the
 * green-bean routes refuse them. It is scoped the same way.
 *
 * Since "each their own" (2026-10-05) the other roles are scoped too
 * (lib/farmAccess chainScope; each-their-own-scoping.test.ts checks who gets
 * which rows). Only Admins, super admins, HeadJudges and Cuppers still read
 * every chain. This file checks the clauses a farmer's reads send.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARMER = 'farmer-1'
const OWN_FARM = 'farm-own'
const SHARED_FARM = 'farm-shared'

const mockPrisma: any = {
  farm: { findMany: jest.fn() },
  processingBatch: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  parchmentLot: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  greenBeanLot: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
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

// Everyone who still reads every chain.
const unscoped: [string, any][] = [
  ['a Cupper', user(['Cupper'])],
  ['a HeadJudge', user(['HeadJudge'])],
  ['an Admin', user(['Admin'])],
  ['a super admin who only holds Farmer', user(['Farmer'], true)],
]

const memberFarms = { farmId: { in: [OWN_FARM, SHARED_FARM] } }
// What each model's farmer clause is.
const farmerBatches = { harvestLot: memberFarms }
const farmerParchment = { harvestLot: memberFarms }
const farmerGreen = { parchmentLot: { harvestLot: memberFarms } }

const request = (url: string) => new NextRequest(`http://localhost:3001${url}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const whereOf = (model: any) => model.findMany.mock.calls[0][0].where

// One record of each kind; the scope lookup (findFirst) decides who may open it.
const batch = () => ({
  id: 'pb-1',
  harvestLotId: 'hl-1',
  createdById: 'processor-9',
  harvestLot: { id: 'hl-1', farmId: 'farm-other', farm: { id: 'farm-other', farmName: 'Farm', location: 'Nan' } },
  parchmentLots: [],
  dryingLogs: [],
})
const parchment = () => ({
  id: 'pl-1',
  processType: 'Washed',
  processingBatch: null,
  harvestLot: { id: 'hl-1', farmerName: 'Someone', cherryVariety: 'Typica', farmId: 'farm-other' },
  physicalTestResults: null,
  greenBeanLots: [],
})
const green = () => ({
  id: 'gbl-1',
  grade: 'Grade A',
  createdById: 'processor-9',
  parchmentLot: null,
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
  mockPrisma.processingBatch.findUnique.mockResolvedValue(batch())
  mockPrisma.parchmentLot.findUnique.mockResolvedValue(parchment())
  mockPrisma.greenBeanLot.findUnique.mockResolvedValue(green())
})

describe('lib/farmAccess chainScope for a pure Farmer', () => {
  test('the chain on farms they own or collaborate on, and the harvest lots recorded for them', async () => {
    const { chainScope } = await import('@/lib/farmAccess')
    const scope = await chainScope(pureFarmer as any)
    expect(mockPrisma.farm.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ ownerId: FARMER }, { collaborators: { some: { userId: FARMER } } }],
    })
    expect(scope).toMatchObject({
      harvestLotWhere: { OR: [memberFarms, { createdById: FARMER }] },
      processingBatchWhere: farmerBatches,
      parchmentLotWhere: farmerParchment,
      greenBeanLotWhere: farmerGreen,
      pricingWhere: { greenBeanLot: farmerGreen },
    })
  })

  test.each(unscoped)('no limit for %s', async (_label, viewer) => {
    const { chainScope } = await import('@/lib/farmAccess')
    expect(await chainScope(viewer)).toBeNull()
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })
})

describe('list routes', () => {
  const lists: [string, string, () => any, any][] = [
    ['GET /api/processing-batches', '/api/processing-batches', () => mockPrisma.processingBatch, farmerBatches],
    ['GET /api/parchment-lots', '/api/parchment-lots', () => mockPrisma.parchmentLot, farmerParchment],
    ['GET /api/green-bean-lots', '/api/green-bean-lots', () => mockPrisma.greenBeanLot, farmerGreen],
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
    expect(whereOf(model())).toEqual({ AND: [scope] })
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
      AND: [farmerBatches],
    })
  })

  test('a pure Farmer with no farms gets nothing', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.farm.findMany.mockResolvedValue([])
    await list('/api/parchment-lots')
    expect(whereOf(mockPrisma.parchmentLot)).toEqual({ AND: [{ harvestLot: { farmId: { in: [] } } }] })
  })
})

describe('by-id routes', () => {
  const routes: [string, () => any, any, () => Promise<Response>][] = [
    ['GET /api/processing-batches/:id', () => mockPrisma.processingBatch, farmerBatches, async () => {
      const { GET } = await import('@/app/api/processing-batches/[id]/route')
      return GET(request('/api/processing-batches/pb-1'), params('pb-1'))
    }],
    ['GET /api/parchment-lots/:id', () => mockPrisma.parchmentLot, farmerParchment, async () => {
      const { GET } = await import('@/app/api/parchment-lots/[id]/route')
      return GET(request('/api/parchment-lots/pl-1'), params('pl-1'))
    }],
    ['GET /api/green-bean-lots/:id', () => mockPrisma.greenBeanLot, farmerGreen, async () => {
      const { GET } = await import('@/app/api/green-bean-lots/[id]/route')
      return GET(request('/api/green-bean-lots/gbl-1'), params('gbl-1'))
    }],
  ]
  const idOf: Record<string, string> = {
    'GET /api/processing-batches/:id': 'pb-1',
    'GET /api/parchment-lots/:id': 'pl-1',
    'GET /api/green-bean-lots/:id': 'gbl-1',
  }

  test.each(routes)('%s: a pure Farmer gets 403 on a record outside their farms', async (_label, model, _scope, open) => {
    mockAuthUser = pureFarmer
    model().findFirst.mockResolvedValue(null)
    const response = await open()
    expect(response.status).toBe(403)
  })

  test.each(routes)('%s: a pure Farmer opens a record on their farms, looked up through their farms', async (label, model, scope, open) => {
    mockAuthUser = pureFarmer
    model().findFirst.mockResolvedValue({ id: idOf[label] })
    const response = await open()
    expect(response.status).toBe(200)
    expect(model().findFirst).toHaveBeenCalledWith({
      where: { id: idOf[label], AND: [scope] },
      select: { id: true },
    })
  })

  test.each(
    routes.flatMap(([label, model, , open]) =>
      unscoped.map(([who, viewer]): [string, string, () => any, () => Promise<Response>, any] => [label, who, model, open, viewer])),
  )('%s: %s opens any record without a scope lookup', async (_label, _who, model, open, viewer) => {
    mockAuthUser = viewer
    const response = await open()
    expect(response.status).toBe(200)
    expect(model().findFirst).not.toHaveBeenCalled()
  })

  test('an unknown id is still 404 for a pure Farmer', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.processingBatch.findUnique.mockResolvedValue(null)
    const { GET } = await import('@/app/api/processing-batches/[id]/route')
    const response = await GET(request('/api/processing-batches/nope'), params('nope'))
    expect(response.status).toBe(404)
    expect(mockPrisma.processingBatch.findFirst).not.toHaveBeenCalled()
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
    expect(await history()).toEqual({ AND: [{ greenBeanLot: farmerGreen }] })
  })

  test("a pure Farmer asking for another farm's lot by id still gets only their farms' rows", async () => {
    mockAuthUser = pureFarmer
    expect(await history('?greenBeanLotId=gbl-other')).toEqual({
      greenBeanLotId: 'gbl-other',
      AND: [{ greenBeanLot: farmerGreen }],
    })
  })

  test.each(unscoped)('%s gets the price history of every lot', async (_label, viewer) => {
    mockAuthUser = viewer
    expect(await history('?greenBeanLotId=gbl-1')).toEqual({ greenBeanLotId: 'gbl-1' })
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })
})
