/**
 * Harvest lots for their owner and Admins:
 * - the owner is createdById, or else the farm's owner; a lot an Admin
 *   records on a farmer's farm belongs to that farmer
 * - PUT writes only the keys the body sends, checked by updateHarvestLotSchema
 * - a lot stays on a farm, and moves only to a farm the caller owns
 * - once a batch or parchment lot draws on it, its weight and status are
 *   locked for its owner (other details are not); an Admin may still correct
 *   the weight, and nobody sets it back to Ready. A lot only marked Complete
 *   by hand is not locked
 * - DELETE refuses a processed lot with what it would take along, unless an
 *   Admin asks for ?cascade=1 (with ?expect= the counts they saw)
 * The Processor path is covered in harvest-lot-processor-edit.test.ts.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  harvestLot: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  farm: { findUnique: jest.fn() },
  cropYear: { findUnique: jest.fn() },
  processingBatch: { count: jest.fn() },
  parchmentLot: { count: jest.fn() },
  greenBeanLot: { count: jest.fn() },
  parchmentWithdrawal: { count: jest.fn() },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Mock middleware (same shape as bola-authorization.test.ts)
let mockAuthUser: any = null

const mockRequireAuth = jest.fn(async () => {
  if (!mockAuthUser) throw new Error('Unauthorized')
  return mockAuthUser
})

const mockRequireRole = jest.fn((user: any, roles: string[]) => {
  const hasRole = user.roles.some((role: string) => roles.includes(role))
  if (!hasRole && !user.isSuperAdmin) {
    throw new Error('Insufficient permissions')
  }
})

const mockRequireOwnership = jest.fn(
  (user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
    if (user.isSuperAdmin) return
    const hasAllowedRole = user.roles.some((role: string) => allowedRoles.includes(role))
    if (hasAllowedRole) return
    if (!ownerId || user.id !== ownerId) {
      throw new Error('Insufficient permissions')
    }
  },
)

const mockHandleApiError = jest.fn((error: any) => {
  const status =
    error.message === 'Unauthorized'
      ? 401
      : error.message === 'Insufficient permissions'
        ? 403
        : 500
  return new Response(JSON.stringify({ error: error.message }), { status })
})

jest.mock('@/lib/middleware', () => ({
  requireAuth: mockRequireAuth,
  requireRole: mockRequireRole,
  requireOwnership: mockRequireOwnership,
  handleApiError: mockHandleApiError,
}))

const LOT_ID = 'lot-123'
const FARMER_A = 'farmer-a'
const FARMER_B = 'farmer-b'
const FARM_A = '0b6f4c8e-3d2a-4f1b-9c7e-1a2b3c4d5e6f'
const FARM_A2 = '1c7a5d9f-4e3b-4a2c-8d8f-2b3c4d5e6f70'
const FARM_B = '2d8b6e0a-5f4c-4b3d-9e9a-3c4d5e6f7081'
const CROP_YEAR = '3e9c7f1b-6a5d-4c4e-8fab-4d5e6f708192'

const farmerA = { id: FARMER_A, roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const farmerB = { id: FARMER_B, roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }
const processor = { id: 'processor-1', roles: ['Processor'], isActive: true, isSuperAdmin: false }

const farms: Record<string, { ownerId: string }> = {
  [FARM_A]: { ownerId: FARMER_A },
  [FARM_A2]: { ownerId: FARMER_A },
  [FARM_B]: { ownerId: FARMER_B },
}

// What the route reads about a lot before deciding anything.
const readyLot = {
  createdById: FARMER_A,
  farmId: FARM_A,
  weightKg: 150,
  status: 'ReadyForProcessing',
  farm: { ownerId: FARMER_A },
  _count: { processingBatches: 0, parchmentLots: 0 },
}
// Recorded before createdById was stored: only the farm says who owns it.
const legacyLot = { ...readyLot, createdById: null }
const processedLot = { ...readyLot, status: 'Complete', _count: { processingBatches: 1, parchmentLots: 1 } }
// Processed = a batch or parchment lot draws on it, whatever its stored status.
const processedLots: Array<[string, typeof readyLot]> = [
  ['has a processing batch', { ...readyLot, status: 'Complete', _count: { processingBatches: 1, parchmentLots: 0 } }],
  ['has a parchment lot', { ...readyLot, status: 'Complete', _count: { processingBatches: 0, parchmentLots: 1 } }],
  ['has a batch but still says Ready', { ...readyLot, _count: { processingBatches: 1, parchmentLots: 0 } }],
]
// Marked Complete by hand: nothing draws on it, so it is not locked.
const handCompletedLot = { ...readyLot, status: 'Complete' }

const unprocessedWhere = {
  id: LOT_ID,
  status: 'ReadyForProcessing',
  processingBatches: { none: {} },
  parchmentLots: { none: {} },
}

const fullLot = {
  id: LOT_ID,
  farmerName: 'Somchai',
  cherryVariety: 'Catimor',
  weightKg: 150,
  farmPlotLocation: 'Plot B',
  harvestDate: new Date('2025-12-01T12:00:00.000Z'),
  status: 'ReadyForProcessing',
  remainingWeightKg: null,
  farmId: FARM_A,
  cropYearId: null,
  createdById: FARMER_A,
  _count: { processingBatches: 0 },
  farm: { id: FARM_A, farmName: 'Doi Farm', location: 'Chiang Rai' },
  cropYear: null,
}

// findUnique answers by what the route asks for: the access check selects
// createdById, the response re-read includes relations, the "still there?"
// probe selects only the id.
function mockLots({ access, stillThere = true }: { access: any; stillThere?: boolean }) {
  mockPrisma.harvestLot.findUnique.mockImplementation(async (args: any) => {
    if (args.include) return fullLot
    if (args.select?.createdById) return access
    if (args.select?.id) return stillThere ? { id: LOT_ID } : null
    return null
  })
}

const lotUrl = (query = '') => `http://localhost:3001/api/harvest-lots/${LOT_ID}${query}`
const params = () => Promise.resolve({ id: LOT_ID })

async function put(body: unknown) {
  const { PUT } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await PUT(
    new NextRequest(lotUrl(), {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: params() },
  )
  return { status: response.status, data: await response.json() }
}

async function del(query = '') {
  const { DELETE } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await DELETE(new NextRequest(lotUrl(query), { method: 'DELETE' }), { params: params() })
  return { status: response.status, data: await response.json() }
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/harvest-lots/route')
  const response = await POST(
    new NextRequest('http://localhost:3001/api/harvest-lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status, data: await response.json() }
}

// The data of the single write the route made, whichever way it wrote.
function writtenData() {
  const calls = [...mockPrisma.harvestLot.update.mock.calls, ...mockPrisma.harvestLot.updateMany.mock.calls]
  expect(calls).toHaveLength(1)
  return (calls[0][0] as any).data
}

function expectNothingWritten() {
  expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
}

function expectNothingDeleted() {
  expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
  expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
}

const LOCKED = 'This lot has already been processed, so its weight and status are locked'
const STATUS_STAYS = 'This lot has a processing batch or parchment lot, so its status stays Complete'
const FARM_REQUIRED = 'A harvest lot must stay on a farm'
// The unprocessedWhere of a lot that was read as Complete.
const handCompletedWhere = { ...unprocessedWhere, status: 'Complete' }

async function get() {
  const { GET } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await GET(new NextRequest(lotUrl(), { method: 'GET' }), { params: params() })
  return { status: response.status, data: await response.json() }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.harvestLot.findMany.mockResolvedValue([])
  mockPrisma.harvestLot.create.mockImplementation(async (args: any) => ({ id: 'new-lot', ...args.data }))
  mockPrisma.harvestLot.update.mockResolvedValue(fullLot)
  mockPrisma.harvestLot.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.harvestLot.delete.mockResolvedValue({})
  mockPrisma.harvestLot.deleteMany.mockResolvedValue({ count: 1 })
  mockPrisma.farm.findUnique.mockImplementation(async (args: any) => farms[args.where.id] ?? null)
  mockPrisma.cropYear.findUnique.mockImplementation(async (args: any) =>
    args.where.id === CROP_YEAR ? { id: CROP_YEAR } : null,
  )
  mockPrisma.processingBatch.count.mockResolvedValue(2)
  mockPrisma.parchmentLot.count.mockResolvedValue(3)
  mockPrisma.greenBeanLot.count.mockResolvedValue(4)
  mockPrisma.parchmentWithdrawal.count.mockResolvedValue(5)
})

describe('who owns a harvest lot', () => {
  test('the farmer in createdById owns it, even on a farm someone else owns', async () => {
    mockLots({ access: { ...readyLot, farm: { ownerId: FARMER_B } } })

    mockAuthUser = farmerA
    expect((await put({ cherryVariety: 'Typica' })).status).toBe(200)
    expect(mockRequireOwnership).toHaveBeenCalledWith(farmerA, FARMER_A, ['Admin'])

    mockAuthUser = farmerB
    expect((await put({ cherryVariety: 'Typica' })).status).toBe(403)
    expect((await del()).status).toBe(403)
    expect(mockPrisma.harvestLot.update).toHaveBeenCalledTimes(1)
    expectNothingDeleted()
  })

  test('a lot without createdById belongs to its farm owner', async () => {
    mockLots({ access: legacyLot })
    mockAuthUser = farmerA

    expect((await put({ cherryVariety: 'Typica' })).status).toBe(200)
    expect((await del()).status).toBe(200)
    expect(mockRequireOwnership).toHaveBeenCalledWith(farmerA, FARMER_A, ['Admin'])
    expect(mockPrisma.harvestLot.deleteMany).toHaveBeenCalledWith({ where: unprocessedWhere })
  })

  test('another farmer gets 403 on a lot without createdById', async () => {
    mockLots({ access: legacyLot })
    mockAuthUser = farmerB

    expect((await put({ cherryVariety: 'Typica' })).status).toBe(403)
    expect((await del()).status).toBe(403)
    expectNothingWritten()
    expectNothingDeleted()
  })

  test('a lot with no owner and no farm is for Admins only', async () => {
    mockLots({ access: { ...legacyLot, farmId: null, farm: null } })

    mockAuthUser = farmerA
    expect((await put({ cherryVariety: 'Typica' })).status).toBe(403)

    mockAuthUser = admin
    expect((await put({ cherryVariety: 'Typica' })).status).toBe(200)
  })

  test('a farm owner who is also a Processor takes the owner path', async () => {
    mockLots({ access: legacyLot })
    mockAuthUser = { ...farmerA, roles: ['Farmer', 'Processor'] }

    // The Processor path would refuse farmerName with 403.
    const { status } = await put({ farmerName: 'Somchai K.' })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ farmerName: 'Somchai K.' })
  })

  test('GET lets a farmer read the lots they may edit, by the same owner', async () => {
    const readable = (lot: Record<string, unknown>) =>
      mockPrisma.harvestLot.findUnique.mockResolvedValue({ ...fullLot, processingBatches: [], ...lot })

    // Their lot that lost its farm.
    readable({ createdById: FARMER_A, farmId: null, farm: null })
    mockAuthUser = farmerA
    expect((await get()).status).toBe(200)
    mockAuthUser = farmerB
    expect((await get()).status).toBe(403)

    // An older lot: the farm's owner.
    readable({ createdById: null, farm: { id: FARM_A, farmName: 'Doi Farm', location: 'Chiang Rai', ownerId: FARMER_A } })
    mockAuthUser = farmerA
    const { status, data } = await get()
    expect(status).toBe(200)
    expect(data.harvestLot.farm).toEqual({ id: FARM_A, farmName: 'Doi Farm', location: 'Chiang Rai' })
    mockAuthUser = farmerB
    expect((await get()).status).toBe(403)
  })
})

describe('POST /api/harvest-lots stores the owner', () => {
  const newLot = {
    farmerName: 'Somchai',
    cherryVariety: 'Catimor',
    weightKg: 150,
    farmPlotLocation: 'Plot B',
    harvestDate: '2025-12-01',
  }

  test('a lot an Admin records on a farmer\'s farm belongs to that farmer', async () => {
    mockAuthUser = admin

    const { status } = await post({ ...newLot, farmId: FARM_A })

    expect(status).toBe(201)
    expect(mockPrisma.harvestLot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ farmId: FARM_A, createdById: FARMER_A }),
      }),
    )
  })

  test('a farmer\'s lot on their own farm is theirs', async () => {
    mockAuthUser = farmerA

    const { status } = await post({ ...newLot, farmId: FARM_A })

    expect(status).toBe(201)
    expect(mockPrisma.harvestLot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: FARMER_A }) }),
    )
  })

  test('a lot without a farm belongs to whoever records it', async () => {
    mockAuthUser = farmerA

    const { status } = await post(newLot)

    expect(status).toBe(201)
    expect(mockPrisma.harvestLot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ farmId: null, createdById: FARMER_A }),
      }),
    )
  })

  test('a farmer cannot record a lot on another farmer\'s farm', async () => {
    mockAuthUser = farmerB

    const { status } = await post({ ...newLot, farmId: FARM_A })

    expect(status).toBe(403)
    expect(mockPrisma.harvestLot.create).not.toHaveBeenCalled()
  })
})

describe('PUT writes only what the body sends', () => {
  beforeEach(() => {
    mockAuthUser = farmerA
    mockLots({ access: readyLot })
  })

  test('a one-field edit writes that field and nothing else', async () => {
    const { status, data } = await put({ cherryVariety: '  Typica  ' })

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LOT_ID }, data: { cherryVariety: 'Typica' } }),
    )
    expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    expect(data.harvestLot).toMatchObject({ id: LOT_ID, status: 'ReadyForProcessing', remainingWeightKg: 150 })
  })

  test('unknown keys are dropped, never written', async () => {
    const { status } = await put({
      cherryVariety: 'Typica',
      createdById: FARMER_B,
      remainingWeightKg: 0,
      displayId: 'HL-2026-999',
      id: 'another-lot',
    })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ cherryVariety: 'Typica' })
  })

  test('the farmer name, plot and harvest date are written as sent', async () => {
    const { status } = await put({
      farmerName: ' Somchai K. ',
      farmPlotLocation: 'Plot C',
      harvestDate: '2025-12-02',
    })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({
      farmerName: 'Somchai K.',
      farmPlotLocation: 'Plot C',
      harvestDate: new Date('2025-12-02T12:00:00.000Z'),
    })
  })

  test.each([
    ['null', null],
    ['an empty choice', ''],
  ])('%s clears the crop year', async (_label, cropYearId) => {
    const { status } = await put({ cropYearId })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ cropYearId: null })
    expect(mockPrisma.cropYear.findUnique).not.toHaveBeenCalled()
  })

  test('sets a crop year that exists', async () => {
    const { status } = await put({ cropYearId: CROP_YEAR })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ cropYearId: CROP_YEAR })
  })

  test('refuses a crop year that does not exist', async () => {
    const { status, data } = await put({ cropYearId: 'no-such-year' })

    expect(status).toBe(400)
    expect(data.error).toBe('Crop year not found')
    expectNothingWritten()
  })

  test('an empty body changes nothing and returns the lot', async () => {
    const { status, data } = await put({})

    expect(status).toBe(200)
    expectNothingWritten()
    expect(data.harvestLot).toMatchObject({ id: LOT_ID })
  })

  test.each([
    ['a number', 180],
    ['a numeric string', '180'],
  ])('a weight change (%s) on an unprocessed lot only matches an unprocessed lot', async (_label, weightKg) => {
    const { status } = await put({ weightKg })

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
      where: unprocessedWhere,
      data: { weightKg: 180 },
    })
    expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
  })

  test('a status change on an unprocessed lot only matches an unprocessed lot', async () => {
    const { status } = await put({ status: 'Complete' })

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
      where: unprocessedWhere,
      data: { status: 'Complete' },
    })
  })

  test('a weight change on a lot processed since it was read is 409', async () => {
    mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })

    const { status, data } = await put({ weightKg: 180 })

    expect(status).toBe(409)
    expect(data.error).toBe(LOCKED)
  })

  test('an Admin whose weight change raced a batch is told nothing was changed', async () => {
    mockAuthUser = admin
    mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })

    const { status, data } = await put({ weightKg: 180 })

    expect(status).toBe(409)
    expect(data.error).toBe('This cherry lot has already been processed, so it was not changed')
  })

  test.each([
    ['text weight', { weightKg: 'abc' }, 'Weight must be a number greater than 0'],
    ['zero weight', { weightKg: 0 }, 'Weight must be greater than 0'],
    ['null weight', { weightKg: null }, 'Weight must be a number greater than 0'],
    ['empty farmer name', { farmerName: '' }, 'Farmer name cannot be empty'],
    ['numeric farmer name', { farmerName: 12 }, 'Farmer name must be text'],
    ['null farmer name', { farmerName: null }, 'Farmer name must be text'],
    ['blank variety', { cherryVariety: '   ' }, 'Cherry variety cannot be empty'],
    ['empty plot', { farmPlotLocation: '' }, 'Plot location cannot be empty'],
    ['unknown status', { status: 'Done' }, 'Status must be ReadyForProcessing or Complete'],
    ['null status', { status: null }, 'Status must be ReadyForProcessing or Complete'],
    ['malformed date', { harvestDate: 'March 3' }, 'Harvest date must be a date like 2026-09-23'],
    ['future date', { harvestDate: '2099-01-01' }, 'Harvest date cannot be in the future'],
    ['numeric crop year', { cropYearId: 5 }, 'Crop year must be a crop year id or null'],
    ['numeric farm', { farmId: 5 }, 'Farm must be a farm id'],
  ])('returns 400 for %s', async (_label, body, message) => {
    const { status, data } = await put({ cherryVariety: 'Typica', ...body })

    expect(status).toBe(400)
    expect(data.error).toBe(message)
    expectNothingWritten()
  })

  test.each([
    ['not JSON', 'not json'],
    ['an array', '[]'],
  ])('returns 400 for a body that is %s', async (_label, body) => {
    const { status, data } = await put(body)

    expect(status).toBe(400)
    expect(data.error).toBe('Invalid JSON body')
  })
})

describe('the farm of a lot', () => {
  test.each([
    ['null', null],
    ['empty', ''],
    ['blank', '   '],
  ])('a %s farm is refused, even for an Admin', async (_label, farmId) => {
    mockLots({ access: readyLot })

    for (const user of [farmerA, admin, superAdmin]) {
      mockAuthUser = user
      const { status, data } = await put({ cherryVariety: 'Typica', farmId })

      expect(status).toBe(400)
      expect(data.error).toBe(FARM_REQUIRED)
    }
    expectNothingWritten()
  })

  test('a farmer cannot move a lot to another farmer\'s farm', async () => {
    mockLots({ access: readyLot })
    mockAuthUser = farmerA

    const { status } = await put({ farmId: FARM_B })

    expect(status).toBe(403)
    expect(mockRequireOwnership).toHaveBeenCalledWith(farmerA, FARMER_B, ['Admin'])
    expectNothingWritten()
  })

  test('a farmer can move a lot to another farm they own', async () => {
    mockLots({ access: readyLot })
    mockAuthUser = farmerA

    const { status } = await put({ farmId: FARM_A2 })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ farmId: FARM_A2, createdById: FARMER_A })
  })

  test.each([
    ['Admin', admin],
    ['super admin', superAdmin],
  ])('an %s can move a lot to any farm, and it then belongs to that farm\'s owner', async (_label, user) => {
    mockLots({ access: legacyLot })
    mockAuthUser = user

    const { status } = await put({ farmId: FARM_B })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ farmId: FARM_B, createdById: FARMER_B })
  })

  test('a farm that does not exist is 404', async () => {
    mockLots({ access: readyLot })
    mockAuthUser = admin

    const { status, data } = await put({ farmId: 'no-such-farm' })

    expect(status).toBe(404)
    expect(data.error).toBe('Farm not found')
    expectNothingWritten()
  })

  test('sending the farm the lot is on is not a move', async () => {
    mockLots({ access: readyLot })
    mockAuthUser = farmerA

    const { status } = await put({ farmId: FARM_A, cherryVariety: 'Typica' })

    expect(status).toBe(200)
    expect(mockPrisma.farm.findUnique).not.toHaveBeenCalled()
    expect(writtenData()).toEqual({ cherryVariety: 'Typica' })
  })
})

describe('a processed lot', () => {
  const ownerPathUsers: Array<[string, any]> = [
    ['owner Farmer', farmerA],
    ['Admin', admin],
    ['super admin', superAdmin],
  ]

  describe.each(processedLots)('that %s', (_label, lot) => {
    test('its owner cannot change its weight or status', async () => {
      mockLots({ access: lot })
      mockAuthUser = farmerA

      const weight = await put({ weightKg: 200 })
      const weightWithDetails = await put({ cherryVariety: 'Typica', weightKg: 200 })
      const status = await put({ status: 'ReadyForProcessing' })

      for (const response of [weight, weightWithDetails, status]) {
        expect(response.status).toBe(409)
        expect(response.data.error).toBe(LOCKED)
      }
      expectNothingWritten()
    })

    test.each([
      ['Admin', admin],
      ['super admin', superAdmin],
    ])('an %s can correct its weight', async (_userLabel, user) => {
      mockLots({ access: lot })
      mockAuthUser = user

      const { status } = await put({ cherryVariety: 'Typica', weightKg: 200 })

      expect(status).toBe(200)
      // Nothing to race: the lot is processed already.
      expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOT_ID }, data: { cherryVariety: 'Typica', weightKg: 200 } }),
      )
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test.each([
      ['Admin', admin],
      ['super admin', superAdmin],
    ])('an %s cannot set it back to Ready while something draws on it', async (_userLabel, user) => {
      mockLots({ access: lot })
      mockAuthUser = user

      const { status, data } = await put({ weightKg: 200, status: 'ReadyForProcessing' })

      expect(status).toBe(409)
      expect(data.error).toBe(STATUS_STAYS)
      expectNothingWritten()
    })

    test.each(ownerPathUsers)('%s can still change its variety', async (_userLabel, user) => {
      mockLots({ access: lot })
      mockAuthUser = user

      const { status } = await put({ cherryVariety: 'Typica' })

      expect(status).toBe(200)
      expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOT_ID }, data: { cherryVariety: 'Typica' } }),
      )
    })
  })

  test('an edit form that re-sends the same weight and Complete only writes what changed', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    const { status } = await put({
      farmerName: 'Somchai',
      cherryVariety: 'Typica',
      weightKg: 150,
      farmPlotLocation: 'Plot B',
      harvestDate: '2025-12-01',
      status: 'Complete',
      cropYearId: CROP_YEAR,
      farmId: FARM_A,
    })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({
      farmerName: 'Somchai',
      cherryVariety: 'Typica',
      farmPlotLocation: 'Plot B',
      harvestDate: new Date('2025-12-01T12:00:00.000Z'),
      cropYearId: CROP_YEAR,
    })
  })

  test('an Admin can still move it to another farm and crop year', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    const { status } = await put({ farmId: FARM_B, cropYearId: CROP_YEAR })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ farmId: FARM_B, createdById: FARMER_B, cropYearId: CROP_YEAR })
  })

  test('Complete is written onto a processed lot whose stored status still says Ready', async () => {
    mockLots({ access: { ...readyLot, _count: { processingBatches: 1, parchmentLots: 1 } } })
    mockAuthUser = farmerA

    const { status } = await put({ status: 'Complete', weightKg: 150 })

    expect(status).toBe(200)
    expect(writtenData()).toEqual({ status: 'Complete' })
  })
})

describe('a lot marked Complete by hand, with nothing drawing on it', () => {
  test.each([
    ['owner Farmer', farmerA],
    ['Admin', admin],
  ])('%s can set it back to Ready, only while nothing draws on it', async (_label, user) => {
    mockLots({ access: handCompletedLot })
    mockAuthUser = user

    const { status } = await put({ status: 'ReadyForProcessing' })

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
      where: handCompletedWhere,
      data: { status: 'ReadyForProcessing' },
    })
    expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
  })

  test('its owner can change its weight', async () => {
    mockLots({ access: handCompletedLot })
    mockAuthUser = farmerA

    const { status } = await put({ weightKg: 180 })

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
      where: handCompletedWhere,
      data: { weightKg: 180 },
    })
  })

  test('a batch or parchment lot drawing on it since it was read makes the write 409', async () => {
    mockLots({ access: handCompletedLot })
    mockAuthUser = farmerA
    mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })

    const { status, data } = await put({ status: 'ReadyForProcessing' })

    expect(status).toBe(409)
    expect(data.error).toBe(LOCKED)
  })

  test('its owner can delete it, without a cascade', async () => {
    mockLots({ access: handCompletedLot })
    mockAuthUser = farmerA

    const { status } = await del()

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.deleteMany).toHaveBeenCalledWith({ where: handCompletedWhere })
    expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
  })

  test('a Processor still cannot edit or delete it', async () => {
    mockLots({ access: handCompletedLot })
    mockAuthUser = processor

    expect((await put({ cherryVariety: 'Typica' })).status).toBe(409)
    expect((await del()).status).toBe(409)
    expectNothingWritten()
    expectNothingDeleted()
  })
})

describe('DELETE /api/harvest-lots/[id]', () => {
  const dependents = { processingBatches: 2, parchmentLots: 3, greenBeanLots: 4, withdrawals: 5 }
  const parchmentWhere = {
    OR: [{ harvestLotId: LOT_ID }, { processingBatch: { harvestLotId: LOT_ID } }],
  }

  test.each([
    ['owner Farmer', farmerA],
    ['Admin', admin],
    ['super admin', superAdmin],
  ])('%s deletes an unprocessed lot with a delete that only matches an unprocessed lot', async (_label, user) => {
    mockLots({ access: readyLot })
    mockAuthUser = user

    const { status, data } = await del()

    expect(status).toBe(200)
    expect(data.message).toBe('Harvest lot deleted successfully')
    expect(mockPrisma.harvestLot.deleteMany).toHaveBeenCalledWith({ where: unprocessedWhere })
    expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
  })

  describe.each(processedLots)('a lot that %s', (_label, lot) => {
    test.each([
      ['owner Farmer', farmerA],
      ['Admin', admin],
      ['super admin', superAdmin],
    ])('%s gets 409 with what the delete would take along', async (_userLabel, user) => {
      mockLots({ access: lot })
      mockAuthUser = user

      const { status, data } = await del()

      expect(status).toBe(409)
      expect(data).toEqual({ error: 'This lot has already been processed', dependents })
      expectNothingDeleted()
    })
  })

  test('the dependents count the lot\'s batches, its parchment lots, their green-bean lots and withdrawals', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    await del()

    expect(mockPrisma.processingBatch.count).toHaveBeenCalledWith({ where: { harvestLotId: LOT_ID } })
    expect(mockPrisma.parchmentLot.count).toHaveBeenCalledWith({ where: parchmentWhere })
    expect(mockPrisma.greenBeanLot.count).toHaveBeenCalledWith({ where: { parchmentLot: parchmentWhere } })
    expect(mockPrisma.parchmentWithdrawal.count).toHaveBeenCalledWith({
      where: { parchmentLot: parchmentWhere },
    })
  })

  test.each([
    ['Admin', admin],
    ['super admin', superAdmin],
  ])('%s with ?cascade=1 deletes a processed lot with everything linked', async (_label, user) => {
    mockLots({ access: processedLot })
    mockAuthUser = user

    const { status, data } = await del('?cascade=1')

    expect(status).toBe(200)
    expect(data.message).toBe('Harvest lot deleted successfully')
    expect(mockPrisma.harvestLot.delete).toHaveBeenCalledWith({ where: { id: LOT_ID } })
    expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
  })

  test('?cascade=1 with the counts the Admin saw deletes while they still match', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    const { status } = await del('?cascade=1&expect=2,3,4,5')

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.delete).toHaveBeenCalledWith({ where: { id: LOT_ID } })
  })

  test('?cascade=1 refuses with the new counts when something was linked since the Admin looked', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    // A parchment sale was recorded after the popup showed 4 withdrawals.
    const { status, data } = await del('?cascade=1&expect=2,3,4,4')

    expect(status).toBe(409)
    expect(data).toEqual({
      error: 'What is linked to this lot has changed since you looked, so it was not deleted',
      dependents,
    })
    expectNothingDeleted()
  })

  test('only ?cascade=1 cascades', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    for (const query of ['?cascade=true', '?cascade=0', '?cascade']) {
      expect((await del(query)).status).toBe(409)
    }
    expectNothingDeleted()
  })

  test('the owner farmer cannot cascade a processed lot', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = farmerA

    const { status, data } = await del('?cascade=1')

    expect(status).toBe(403)
    expect(data.error).toBe('Only an Admin can delete a processed lot together with everything linked to it')
    expectNothingDeleted()
  })

  test('?cascade=1 on an unprocessed lot is an ordinary delete for the owner', async () => {
    mockLots({ access: readyLot })
    mockAuthUser = farmerA

    const { status } = await del('?cascade=1')

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.deleteMany).toHaveBeenCalledWith({ where: unprocessedWhere })
    expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
  })

  test('a lot processed between the read and the delete is refused with its dependents', async () => {
    mockLots({ access: readyLot, stillThere: true })
    mockPrisma.harvestLot.deleteMany.mockResolvedValueOnce({ count: 0 })
    mockAuthUser = farmerA

    const { status, data } = await del()

    expect(status).toBe(409)
    expect(data.dependents).toEqual(dependents)
    expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
  })

  test('an Admin\'s ?cascade=1 still deletes a lot processed between the read and the delete', async () => {
    mockLots({ access: readyLot, stillThere: true })
    mockPrisma.harvestLot.deleteMany.mockResolvedValueOnce({ count: 0 })
    mockAuthUser = admin

    const { status } = await del('?cascade=1')

    expect(status).toBe(200)
    expect(mockPrisma.harvestLot.delete).toHaveBeenCalledWith({ where: { id: LOT_ID } })
  })

  test('a lot deleted between the read and the delete is 404', async () => {
    mockLots({ access: readyLot, stillThere: false })
    mockPrisma.harvestLot.deleteMany.mockResolvedValueOnce({ count: 0 })
    mockAuthUser = farmerA

    expect((await del()).status).toBe(404)
  })

  test('?ifUnprocessed=1 wins over ?cascade=1', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = admin

    const { status, data } = await del('?ifUnprocessed=1&cascade=1')

    expect(status).toBe(409)
    expect(data.error).toBe('This cherry lot has already been processed, so it was not deleted')
    expectNothingDeleted()
  })

  test('a Processor cannot cascade either', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = processor

    const { status, data } = await del('?cascade=1')

    expect(status).toBe(409)
    expect(data.error).toBe('This cherry lot has already been processed, so a processor can no longer delete it')
    expectNothingDeleted()
  })

  test('another farmer gets 403 with or without ?cascade=1', async () => {
    mockLots({ access: processedLot })
    mockAuthUser = farmerB

    expect((await del()).status).toBe(403)
    expect((await del('?cascade=1')).status).toBe(403)
    expectNothingDeleted()
    expect(mockPrisma.processingBatch.count).not.toHaveBeenCalled()
  })
})
