/**
 * F25 / D8: multi-role accounts. A user who farms and also holds a staff role
 * (Processor, Roaster, HeadJudge, Cupper, Admin) used to be narrowed to their
 * own farms' lots on every screen, so a Farmer+Processor could not process
 * other farmers' cherry. Farmer scoping now applies only to a user with no
 * staff role:
 * - a pure Farmer still sees only their own farms' harvest lots, and only
 *   their farms' batches, parchment and green beans (bulk-load), and still
 *   gets a 403 on another farmer's lot by id
 * - a Farmer with any staff role sees what that staff role alone sees
 * - soil, weather and GAP stay farm-member only for every non-Admin, staff
 *   included (that rule is not a farmer rule and does not change)
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { UserRole } from '@prisma/client'

const FARMER = 'farmer-1'
const OTHER_FARMER = 'farmer-2'
const OWN_FARM = 'farm-own'
const SHARED_FARM = 'farm-shared'

const mockPrisma: any = {
  farm: { findMany: jest.fn(async () => [{ id: OWN_FARM }, { id: SHARED_FARM }]) },
  harvestLot: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(),
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
const processorOnly = user(['Processor'])

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

describe('lib/farmAccess: who counts as staff (D8)', () => {
  test('every role in the enum is either Farmer or a staff role, so a new role forces a decision', async () => {
    const { STAFF_ROLES } = await import('@/lib/farmAccess')
    expect([...STAFF_ROLES, 'Farmer'].sort()).toEqual(Object.values(UserRole).sort())
    expect(STAFF_ROLES).not.toContain('Farmer')
  })

  test.each([
    ['a pure Farmer', true, pureFarmer],
    ['a Farmer+Processor', false, farmerProcessor],
    ['a Farmer+Roaster', false, farmerRoaster],
    ['a Farmer+Cupper', false, farmerCupper],
    ['a Farmer+HeadJudge', false, farmerHeadJudge],
    ['a Farmer+Admin', false, farmerAdmin],
    ['a super admin who only holds Farmer', false, superAdminFarmer],
    ['a Processor', false, processorOnly],
  ])('isFarmerOnly: %s -> %s', async (_label, expected, viewer) => {
    const { isFarmerOnly } = await import('@/lib/farmAccess')
    expect(isFarmerOnly(viewer)).toBe(expected)
  })
})

describe('bulk-load phase 1 harvest lots (F25)', () => {
  test('a pure Farmer gets only the lots on farms they own', async () => {
    mockAuthUser = pureFarmer
    await bulkLoad(1)
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({ farm: { ownerId: FARMER } })
  })

  test.each([
    ['Farmer+Processor', farmerProcessor],
    ['Farmer+Roaster', farmerRoaster],
    ['Farmer+Cupper', farmerCupper],
    ['Farmer+HeadJudge', farmerHeadJudge],
  ])('a %s gets every lot, as the staff role alone does', async (_label, viewer) => {
    mockAuthUser = viewer
    await bulkLoad(1)
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({})
  })
})

describe('bulk-load phase 2 lot chain (F25)', () => {
  const memberFarms = { farmId: { in: [OWN_FARM, SHARED_FARM] } }

  test('a pure Farmer gets batches, parchment and green beans from their farms only', async () => {
    mockAuthUser = pureFarmer
    await bulkLoad(2)
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({ harvestLot: memberFarms })
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({ harvestLot: memberFarms })
    expect(argsOf(mockPrisma.greenBeanLot).where).toEqual({ parchmentLot: { harvestLot: memberFarms } })
  })

  test('a Farmer+Processor gets every batch, parchment lot and green-bean lot', async () => {
    mockAuthUser = farmerProcessor
    await bulkLoad(2)
    expect(argsOf(mockPrisma.processingBatch).where).toEqual({})
    expect(argsOf(mockPrisma.parchmentLot).where).toEqual({})
    expect(argsOf(mockPrisma.greenBeanLot).where).toEqual({})
  })

  test('a Farmer+Processor still sees soil, weather and GAP only on farms they belong to', async () => {
    mockAuthUser = farmerProcessor
    await bulkLoad(2)
    expect(argsOf(mockPrisma.soilAnalysis).where).toEqual(memberFarms)
    expect(argsOf(mockPrisma.weatherRecord).where).toEqual(memberFarms)
    expect(argsOf(mockPrisma.gAPLogEntry).where).toEqual(memberFarms)
  })

  test('a Farmer+Roaster gets the whole lot chain and only their own roaster rows', async () => {
    mockAuthUser = farmerRoaster
    await bulkLoad(2)
    expect(argsOf(mockPrisma.greenBeanLot).where).toEqual({})
    expect(argsOf(mockPrisma.roasterInventoryItem).where).toEqual({ roasterId: FARMER })
  })
})

describe('GET /api/harvest-lots (F25)', () => {
  test('a pure Farmer lists only their own farms\' lots, even when asking for another farm', async () => {
    mockAuthUser = pureFarmer
    await listHarvestLots('?farmId=farm-other&status=ReadyForProcessing')
    const { where } = argsOf(mockPrisma.harvestLot)
    expect(where.farm).toEqual({ ownerId: FARMER })
    expect(where.farmId).toBe('farm-other')
    expect(mockPrisma.harvestLot.count).toHaveBeenCalledWith({ where })
  })

  test('a Farmer+Processor lists every farmer\'s ready cherry', async () => {
    mockAuthUser = farmerProcessor
    await listHarvestLots('?status=ReadyForProcessing')
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({
      status: 'ReadyForProcessing', processingBatches: { none: {} },
    })
  })

  test('a Farmer who is also a super admin is not scoped', async () => {
    mockAuthUser = superAdminFarmer
    await listHarvestLots()
    expect(argsOf(mockPrisma.harvestLot).where).toEqual({})
  })
})

describe('GET /api/harvest-lots/:id (F25)', () => {
  beforeEach(() => {
    mockPrisma.harvestLot.findUnique.mockResolvedValue(othersLot)
  })

  test('a pure Farmer cannot read another farmer\'s lot', async () => {
    mockAuthUser = pureFarmer
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(403)
  })

  test.each([
    ['Farmer+Processor', farmerProcessor],
    ['Farmer+Roaster', farmerRoaster],
    ['Farmer+Cupper', farmerCupper],
  ])('a %s reads another farmer\'s lot, as the staff role alone does', async (_label, viewer) => {
    mockAuthUser = viewer
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.harvestLot.id).toBe('hl-other')
    // The farm's owner id is not passed on.
    expect(body.harvestLot.farm).toEqual({ id: 'farm-other', farmName: 'Mae Farm', location: 'Nan' })
  })

  test('a pure Farmer still reads a lot recorded for them', async () => {
    mockAuthUser = pureFarmer
    mockPrisma.harvestLot.findUnique.mockResolvedValue({ ...othersLot, createdById: FARMER })
    const response = await getHarvestLot('hl-other')
    expect(response.status).toBe(200)
  })
})
