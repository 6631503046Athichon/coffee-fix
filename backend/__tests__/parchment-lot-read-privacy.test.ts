/**
 * What the parchment-lots reads hand back beyond the lot itself:
 * - externalSource.importedBy is a user id (who imported the bought-in lot):
 *   only Admin and the importer get it, on the list and by id
 *   (lib/importerPrivacy)
 * - the list loads the batch's harvestLot.farmId only so chainScope's
 *   canReadBatch can decide what the reader sees of the batch; it reaches no
 *   reader, while the batch's owner, its farm's farmer and Admin still get
 *   its createdById and status
 *
 * Prisma is a plain mock returning the rows as the queries would; which rows
 * each user gets is covered by each-their-own-scoping.test.ts.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  parchmentLot: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  farm: { findMany: jest.fn() },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Real role checks and error handling; only the session is faked.
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

const user = (id: string, roles: string[], isSuperAdmin = false) => ({
  id, email: null, username: null, name: id, roles, isActive: true, isSuperAdmin,
})
const importer = user('proc-a', ['Processor'])
const otherProcessor = user('proc-b', ['Processor'])
const roaster = user('roaster-a', ['Roaster'])
const farmer = user('farmer-1', ['Farmer'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const cupper = user('cupper-1', ['Cupper'])

const externalLot = () => ({
  id: 'pl-ext',
  sourceType: 'External',
  processingBatchId: null,
  processingBatch: null,
  harvestLot: null,
  externalSource: { code: 'X-1', supplier: 'Doi Coop', importedBy: 'proc-a' },
  physicalTestResults: null,
  withdrawalHistory: [],
})

// As the list loads it: the batch's farm only for canReadBatch.
const internalLot = () => ({
  id: 'pl-int',
  sourceType: 'Internal',
  processingBatchId: 'pb-a',
  processingBatch: {
    id: 'pb-a',
    processType: 'Washed',
    status: 'Completed',
    createdById: 'proc-a',
    harvestLot: { farmId: 'farm-1' },
  },
  harvestLot: { id: 'hl-a', farmerName: 'Somchai', cherryVariety: 'Typica' },
  externalSource: null,
  physicalTestResults: null,
  withdrawalHistory: [],
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.parchmentLot.findMany.mockResolvedValue([externalLot(), internalLot()])
  // The by-id scope check found the lot in the reader's share.
  mockPrisma.parchmentLot.findFirst.mockImplementation(async (args: any) => ({ id: args.where.id }))
  mockPrisma.farm.findMany.mockResolvedValue([{ id: 'farm-1' }])
})

async function list(viewer: any) {
  mockAuthUser = viewer
  const { GET } = await import('@/app/api/parchment-lots/route')
  const response = await GET(new NextRequest('http://localhost:3001/api/parchment-lots'))
  expect(response.status).toBe(200)
  const { parchmentLots } = await response.json()
  return Object.fromEntries(parchmentLots.map((lot: any) => [lot.id, lot]))
}

async function open(viewer: any, lot: any) {
  mockAuthUser = viewer
  mockPrisma.parchmentLot.findUnique.mockResolvedValue(lot)
  const { GET } = await import('@/app/api/parchment-lots/[id]/route')
  const response = await GET(new NextRequest(`http://localhost:3001/api/parchment-lots/${lot.id}`), {
    params: Promise.resolve({ id: lot.id }),
  })
  expect(response.status).toBe(200)
  return (await response.json()).parchmentLot
}

describe('externalSource.importedBy', () => {
  test.each([
    ['the importer', importer],
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s gets it, on the list and by id', async (_who, viewer) => {
    expect((await list(viewer))['pl-ext'].externalSource).toEqual({
      code: 'X-1', supplier: 'Doi Coop', importedBy: 'proc-a',
    })
    expect((await open(viewer, externalLot())).externalSource.importedBy).toBe('proc-a')
  })

  test.each([
    ['a roaster reading the parchment behind their green beans', roaster],
    ['another processor', otherProcessor],
    ['a farmer', farmer],
    ['a cupper', cupper],
  ])('%s gets the supplier details without it, on the list and by id', async (_who, viewer) => {
    expect((await list(viewer))['pl-ext'].externalSource).toEqual({ code: 'X-1', supplier: 'Doi Coop' })
    expect((await open(viewer, externalLot())).externalSource).toEqual({ code: 'X-1', supplier: 'Doi Coop' })
  })

  test('the stored row is never changed', async () => {
    const lot = externalLot()
    await open(roaster, lot)
    expect(lot.externalSource.importedBy).toBe('proc-a')
  })

  test('a lot with no externalSource, or none recorded, reads as it is', async () => {
    const lots = await list(roaster)
    expect(lots['pl-int'].externalSource).toBeNull()
    const old = { ...externalLot(), externalSource: { code: 'X-0' } }
    expect((await open(roaster, old)).externalSource).toEqual({ code: 'X-0' })
  })
})

describe("the list's batch", () => {
  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
    ['the batch owner', importer],
    ["the farm's farmer", farmer],
  ])('%s still gets its owner and status, but not the farm loaded for the check', async (_who, viewer) => {
    const { processingBatch } = (await list(viewer))['pl-int']
    expect(processingBatch).toEqual({ id: 'pb-a', processType: 'Washed', status: 'Completed', createdById: 'proc-a' })
    expect(processingBatch.harvestLot).toBeUndefined()
  })

  test('a reader who may not read the batch gets its id and process only', async () => {
    const { processingBatch } = (await list(roaster))['pl-int']
    expect(processingBatch).toEqual({ id: 'pb-a', processType: 'Washed' })
  })

  test('a lot with no batch has none', async () => {
    expect((await list(admin))['pl-ext'].processingBatch).toBeNull()
  })
})
