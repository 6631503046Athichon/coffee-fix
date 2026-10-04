/**
 * F25 / D8: multi-role accounts. A user who farms and also holds a staff role
 * (Processor, Roaster, HeadJudge, Cupper, Admin) used to be narrowed to their
 * own farms' lots on every screen, so a Farmer+Processor could not process
 * other farmers' cherry.
 * - bulk-load and the harvest-lot routes follow "each their own" (2026-10-05,
 *   lib/farmAccess chainScope): a user with several roles reads the union of
 *   their roles' scopes, so a Farmer+Processor gets their farms' lots plus
 *   every Ready lot and the lots their batches used; a farmer reads the lots
 *   of farms they own or collaborate on (each-their-own-scoping.test.ts and
 *   bulk-load-each-their-own.test.ts check the rows)
 * - soil, weather and GAP stay farm-member only for every non-Admin, staff
 *   included (that rule is not a farmer rule and does not change)
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARMER = 'farmer-1'
const OTHER_FARMER = 'farmer-2'
const OWN_FARM = 'farm-own'
const SHARED_FARM = 'farm-shared'

const mockPrisma: any = {
  farm: { findMany: jest.fn(async () => [{ id: OWN_FARM }, { id: SHARED_FARM }]) },
  harvestLot: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(async () => 0),
  },
  cropYear: { findMany: jest.fn(async () => []) },
  processType: { findMany: jest.fn(async () => []) },
  activityType: { findMany: jest.fn(async () => []) },
  coffeeGrade: { findMany: jest.fn(async () => []) },
  customer: { findMany: jest.fn(async () => []) },
  user: { findMany: jest.fn(async () => []) },
  soilAnalysis: { findMany: jest.fn(async () => []) },
  weatherRecord: { findMany: jest.fn(async () => []) },
  gAPLogEntry: { findMany: jest.fn(async () => []) },
  processingBatch: { findMany: jest.fn(async () => []) },
  parchmentLot: { findMany: jest.fn(async () => []) },
  greenBeanLot: { findMany: jest.fn(async () => []) },
  roasterInventoryItem: { findMany: jest.fn(async () => []) },
  roastBatch: { findMany: jest.fn(async () => []) },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Crop-year upkeep writes rows; it has its own tests.
jest.mock('@/lib/cropYears', () => ({
  upkeepCropYears: jest.fn(async () => false),
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
const farmerProcessor = user(['Farmer', 'Processor'])
const farmerRoaster = user(['Farmer', 'Roaster'])
const farmerCupper = user(['Farmer', 'Cupper'])
const farmerHeadJudge = user(['Farmer', 'HeadJudge'])
const farmerAdmin = user(['Farmer', 'Admin'])
const superAdminFarmer = user(['Farmer'], true)

const argsOf = (model: any) => model.findMany.mock.calls[0][0]

const bulkLoad = async (phase: 1 | 2) => {
  const { GET } = await import('@/app/api/bulk-load/route')
  const response = await GET(new NextRequest(`http://localhost:3001/api/bulk-load?phase=${phase}`))
  expect(response.status).toBe(200)
  return response.json()
}

const listHarvestLots = async (query = '') => {
  const { GET } = await import('@/app/api/harvest-lots/route')
  const response = await GET(new NextRequest(`http://localhost:3001/api/harvest-lots${query}`))
  expect(response.status).toBe(200)
  return response.json()
}

const getHarvestLot = async (id: string) => {
  const { GET } = await import('@/app/api/harvest-lots/[id]/route')
  return GET(
    new NextRequest(`http://localhost:3001/api/harvest-lots/${id}`),
    { params: Promise.resolve({ id }) },
  )
}

// Another farmer's cherry lot, recorded for them on their farm.
const othersLot = {
  id: 'hl-other', displayId: 'HL-2026-002', farmId: 'farm-other', createdById: OTHER_FARMER,
  weightKg: 900, status: 'ReadyForProcessing', processingBatches: [],
  farm: { id: 'farm-other', farmName: 'Mae Farm', location: 'Nan', ownerId: OTHER_FARMER },
  cropYear: { id: 'cy-2026', year: '2026/27' },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
})

// bulk-load follows "each their own" like the list routes (lib/farmAccess
// chainScope); bulk-load-each-their-own.test.ts checks the rows.
describe('bulk-load phase 1 harvest lots (each their own)', () => {
  test('a pure Farmer gets the lots on farms they own or collaborate on, and the lots recorded for them', async () => {
    mockAuthUser = pureFarmer
    await bulkLoad(1)
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({ OR: farmerHarvest })
  })

  test("a Farmer+Processor gets the union: their farms' lots, every Ready lot and their batches' lots", async () => {
    mockAuthUser = farmerProcessor
    await bulkLoad(1)
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({ OR: [...farmerHarvest, ...processorHarvest] })
  })

  test("a Farmer+Roaster gets their farms' lots and the cherry behind their green beans", async () => {
    mockAuthUser = farmerRoaster
    await bulkLoad(1)
    const { OR } = argsOf(mockPrisma.harvestLot).where
    expect(OR.slice(0, 2)).toEqual(farmerHarvest)
    expect(OR[2]).toHaveProperty('parchmentLots.some.greenBeanLots.some')
    expect(OR).toHaveLength(3)
  })

  test.each([
    ['Farmer+Cupper (cupping roles read as before)', farmerCupper],
    ['Farmer+HeadJudge (cupping roles read as before)', farmerHeadJudge],
    ['Farmer+Admin', farmerAdmin],
    ['super admin who only holds Farmer', superAdminFarmer],
  ])('a %s gets every lot', async (_label, viewer) => {
    mockAuthUser = viewer
    await bulkLoad(1)
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({})
  })
})

describe('bulk-load phase 2 lot chain (each their own)', () => {
  const memberFarms = { farmId: { in: [OWN_FARM, SHARED_FARM] } }

  test('a pure Farmer gets batches, parchment and green beans from their own and shared farms only', async () => {
    mockAuthUser = pureFarmer
    await bulkLoad(2)
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({ harvestLot: memberFarms })
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({ harvestLot: memberFarms })
    expect(argsOf(mockPrisma.greenBeanLot).where).toEqual({ parchmentLot: { harvestLot: memberFarms } })
  })

  test("a Farmer+Processor gets their farms' chain plus their own processing chain", async () => {
    mockAuthUser = farmerProcessor
    await bulkLoad(2)
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({
      OR: [{ harvestLot: memberFarms }, { createdById: FARMER }],
    })
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({
      OR: [
        { harvestLot: memberFarms },
        { processingBatch: { createdById: FARMER } },
        { processingBatchId: null, externalSource: { path: ['importedBy'], equals: FARMER } },
      ],
    })
    expect(argsOf(mockPrisma.greenBeanLot).where).toEqual({
      OR: [
        { parchmentLot: { harvestLot: memberFarms } },
        { createdById: FARMER },
        { parchmentLot: { processingBatch: { createdById: FARMER } } },
      ],
    })
  })

  test('a Farmer+Processor still sees soil, weather and GAP only on farms they belong to', async () => {
    mockAuthUser = farmerProcessor
    await bulkLoad(2)
    expect(argsOf(mockPrisma.soilAnalysis).where).toEqual(memberFarms)
    expect(argsOf(mockPrisma.weatherRecord).where).toEqual(memberFarms)
    expect(argsOf(mockPrisma.gAPLogEntry).where).toEqual(memberFarms)
  })

  test("a Farmer+Roaster gets their farms' chain plus their green beans and the shelf, no other batches, and only their own roaster rows", async () => {
    mockAuthUser = farmerRoaster
    await bulkLoad(2)
    // A roaster reads no processing batches, so only the farms' ones.
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({ harvestLot: memberFarms })
    const { OR } = argsOf(mockPrisma.greenBeanLot).where
    expect(OR).toEqual([
      { parchmentLot: { harvestLot: memberFarms } },
      { createdById: FARMER },
      { roasterInventory: { some: { roasterId: FARMER } } },
      { roastBatches: { some: { roasterId: FARMER } } },
      { availabilityStatus: 'Available', currentWeightKg: { gt: 0 }, sourceType: 'Internal' },
    ])
    expect(argsOf(mockPrisma.roasterInventoryItem).where).toEqual({ roasterId: FARMER })
  })

  test.each([
    ['Farmer+Cupper (cupping roles read as before)', farmerCupper],
    ['Farmer+Admin', farmerAdmin],
  ])('a %s gets the whole lot chain', async (_label, viewer) => {
    mockAuthUser = viewer
    await bulkLoad(2)
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({})
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({})
    expect(argsOf(mockPrisma.greenBeanLot).where).toEqual({})
  })
})

// A farmer's share of harvest lots: their own and shared farms', and the
// lots recorded for them.
const farmerHarvest = [{ farmId: { in: [OWN_FARM, SHARED_FARM] } }, { createdById: FARMER }]
const ready = { status: 'ReadyForProcessing', processingBatches: { none: {} } }
// A processor's: every Ready lot, and the lots their batches used.
const processorHarvest = [ready, { processingBatches: { some: { createdById: FARMER } } }]

describe('GET /api/harvest-lots (each their own)', () => {
  test("a pure Farmer lists only their own and shared farms' lots, even when asking for another farm", async () => {
    mockAuthUser = pureFarmer
    await listHarvestLots('?farmId=farm-other&status=ReadyForProcessing')
    const { where } = argsOf(mockPrisma.harvestLot)
    expect(where.AND).toEqual([{ OR: farmerHarvest }])
    expect(where.farmId).toBe('farm-other')
    expect(mockPrisma.harvestLot.count).toHaveBeenCalledWith({ where })
  })

  test("a Farmer+Processor lists the union: their farms' lots, every Ready lot and their batches' lots", async () => {
    mockAuthUser = farmerProcessor
    await listHarvestLots('?status=ReadyForProcessing')
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({
      ...ready,
      AND: [{ OR: [...farmerHarvest, ...processorHarvest] }],
    })
  })

  test("a Farmer+Roaster lists their farms' lots and the cherry behind their green beans", async () => {
    mockAuthUser = farmerRoaster
    await listHarvestLots()
    const [scope] = argsOf(mockPrisma.harvestLot).where.AND
    expect(scope.OR.slice(0, 2)).toEqual(farmerHarvest)
    expect(scope.OR[2]).toHaveProperty('parchmentLots.some.greenBeanLots.some')
    expect(scope.OR).toHaveLength(3)
  })

  test.each([
    ['a Farmer who is also a super admin', superAdminFarmer],
    ['a Farmer+Admin', farmerAdmin],
    ['a Farmer+Cupper (cupping roles read as before)', farmerCupper],
    ['a Farmer+HeadJudge (cupping roles read as before)', farmerHeadJudge],
  ])('%s is not scoped', async (_label, viewer) => {
    mockAuthUser = viewer
    await listHarvestLots()
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({})
  })
})

describe('GET /api/harvest-lots/:id (each their own)', () => {
  beforeEach(() => {
    mockPrisma.harvestLot.findUnique.mockResolvedValue(othersLot)
  })

  test("a pure Farmer cannot read another farmer's lot", async () => {
    mockAuthUser = pureFarmer
    mockPrisma.harvestLot.findFirst.mockResolvedValue(null)
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(403)
  })

  test("a Farmer+Processor reads another farmer's Ready lot through the union of their scopes", async () => {
    mockAuthUser = farmerProcessor
    mockPrisma.harvestLot.findFirst.mockResolvedValue({ id: 'hl-other' })
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(200)
    expect(mockPrisma.harvestLot.findFirst).toHaveBeenCalledWith({
      where: { id: 'hl-other', AND: [{ OR: [...farmerHarvest, ...processorHarvest] }] },
      select: { id: true },
    })
    const body = await response.json()
    expect(body.harvestLot.id).toBe('hl-other')
    // The farm's owner id is not passed on.
    expect(body.harvestLot.farm).toEqual({ id: 'farm-other', farmName: 'Mae Farm', location: 'Nan' })
  })

  test('a Farmer+Roaster gets 403 on a lot behind none of their green beans', async () => {
    mockAuthUser = farmerRoaster
    mockPrisma.harvestLot.findFirst.mockResolvedValue(null)
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(403)
  })

  test('a Farmer+Cupper reads it without a scope lookup, as before', async () => {
    mockAuthUser = farmerCupper
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(200)
    expect(mockPrisma.harvestLot.findFirst).not.toHaveBeenCalled()
  })

  test('a pure Farmer still reads a lot recorded for them', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.harvestLot.findUnique.mockResolvedValue({ ...othersLot, createdById: FARMER })
    mockPrisma.harvestLot.findFirst.mockResolvedValue({ id: 'hl-other' })
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(200)
    expect(mockPrisma.harvestLot.findFirst.mock.calls[0][0].where.AND).toEqual([{ OR: farmerHarvest }])
  })
})
