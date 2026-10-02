/**
 * Processors may edit and delete a farmer's cherry (harvest) lot while it is
 * unprocessed. Owner farmers and Admins take the owner path instead (see
 * harvest-lot-owner-edit.test.ts).
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockPrisma: any = {
  harvestLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  // What a refused delete reports would be lost with a processed lot.
  processingBatch: { count: jest.fn(async () => 1) },
  parchmentLot: { count: jest.fn(async () => 1) },
  greenBeanLot: { count: jest.fn(async () => 0) },
  parchmentWithdrawal: { count: jest.fn(async () => 0) },
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
  requireOwnership: mockRequireOwnership,
  handleApiError: mockHandleApiError,
}))

const LOT_ID = 'lot-123'
const OWNER_ID = 'farmer-123'

const processor = { id: 'processor-1', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const ownerFarmer = { id: OWNER_ID, roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const otherFarmer = { id: 'farmer-456', roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const roaster = { id: 'roaster-1', roles: ['Roaster'], isActive: true, isSuperAdmin: false }
const cupper = { id: 'cupper-1', roles: ['Cupper'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }

const readyLot = {
  createdById: OWNER_ID,
  status: 'ReadyForProcessing',
  _count: { processingBatches: 0, parchmentLots: 0 },
}
const processedLots: Array<[string, typeof readyLot]> = [
  ['status Complete', { ...readyLot, status: 'Complete' }],
  ['has a processing batch', { ...readyLot, _count: { processingBatches: 1, parchmentLots: 0 } }],
  ['has a parchment lot', { ...readyLot, _count: { processingBatches: 0, parchmentLots: 1 } }],
]

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
  _count: { processingBatches: 0 },
  farm: { id: 'farm-1', farmName: 'Doi Farm', location: 'Chiang Rai' },
  cropYear: null,
}

// findUnique answers by what the route asks for: the access check selects
// createdById, the response re-read includes relations, the "still there?"
// probe selects only the id.
function mockLots({ access, full = fullLot, stillThere = true }: {
  access: any
  full?: any
  stillThere?: boolean
}) {
  mockPrisma.harvestLot.findUnique.mockImplementation(async (args: any) => {
    if (args.include) return full
    if (args.select?.createdById) return access
    if (args.select?.id) return stillThere ? { id: LOT_ID } : null
    return null
  })
}

// The workbench asks for the unprocessed guard with ?ifUnprocessed=1.
const lotUrl = (guarded = false) =>
  `http://localhost:3001/api/harvest-lots/${LOT_ID}${guarded ? '?ifUnprocessed=1' : ''}`

function putRequest(body: unknown, guarded = false) {
  return new NextRequest(lotUrl(guarded), {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function deleteRequest(guarded = false) {
  return new NextRequest(lotUrl(guarded), { method: 'DELETE' })
}

const params = () => Promise.resolve({ id: LOT_ID })

async function put(body: unknown, { guarded = false } = {}) {
  const { PUT } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await PUT(putRequest(body, guarded), { params: params() })
  return { status: response.status, data: await response.json() }
}

async function del({ guarded = false } = {}) {
  const { DELETE } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await DELETE(deleteRequest(guarded), { params: params() })
  return { status: response.status, data: await response.json() }
}

const processorEdit = {
  cherryVariety: '  Typica  ',
  weightKg: 180.5,
  farmPlotLocation: 'Plot C',
  harvestDate: '2025-12-02',
}

describe('Processor edits and deletes unprocessed cherry lots', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockPrisma.harvestLot.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.harvestLot.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.harvestLot.update.mockResolvedValue(fullLot)
    mockPrisma.harvestLot.delete.mockResolvedValue({})
  })

  describe('PUT /api/harvest-lots/[id] as Processor', () => {
    test('edits a ready lot with a write that only matches an unprocessed lot', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await put(processorEdit)

      expect(status).toBe(200)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
        where: unprocessedWhere,
        data: {
          cherryVariety: 'Typica',
          weightKg: 180.5,
          farmPlotLocation: 'Plot C',
          harvestDate: new Date('2025-12-02T12:00:00.000Z'),
        },
      })
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockRequireOwnership).not.toHaveBeenCalled()
      expect(data.harvestLot).toMatchObject({ id: LOT_ID, status: 'ReadyForProcessing', remainingWeightKg: 150 })
    })

    test('accepts a partial edit and a numeric string weight', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status } = await put({ weightKg: '99.25' })

      expect(status).toBe(200)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
        where: unprocessedWhere,
        data: { weightKg: 99.25 },
      })
    })

    test('accepts an ISO datetime harvest date', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status } = await put({ harvestDate: '2025-12-02T00:00:00.000Z' })

      expect(status).toBe(200)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
        where: unprocessedWhere,
        data: { harvestDate: new Date('2025-12-02T00:00:00.000Z') },
      })
    })

    test('a Farmer+Processor who does not own the lot gets the restricted processor path', async () => {
      mockAuthUser = { ...processor, roles: ['Farmer', 'Processor'] }
      mockLots({ access: readyLot })

      const { status } = await put({ farmerName: 'Someone else' })

      expect(status).toBe(403)
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
    })

    test.each(processedLots)('returns 409 when the lot %s', async (_label, lot) => {
      mockAuthUser = processor
      mockLots({ access: lot })

      const { status, data } = await put(processorEdit)

      expect(status).toBe(409)
      expect(data.error).toBe(
        'This cherry lot has already been processed, so a processor can no longer edit it',
      )
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
    })

    test('returns 409 when the lot is processed between the read and the write', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot, stillThere: true })
      mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })

      const { status, data } = await put(processorEdit)

      expect(status).toBe(409)
      expect(data.error).toMatch(/already been processed/)
    })

    test('returns 404 when the lot is deleted between the read and the write', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot, stillThere: false })
      mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })

      const { status } = await put(processorEdit)

      expect(status).toBe(404)
    })

    test.each([
      ['farmerName', { farmerName: 'Somchai' }],
      ['status', { status: 'Complete' }],
      ['cropYearId', { cropYearId: 'cy-1' }],
      ['farmId (even null)', { farmId: null }],
      ['an unknown field', { createdById: 'processor-1' }],
    ])('returns 403 when the body sends %s', async (_label, extra) => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await put({ ...processorEdit, ...extra })

      expect(status).toBe(403)
      expect(data.error).toMatch(
        /^Processors can only change cherryVariety, weightKg, farmPlotLocation, harvestDate\. Not allowed: /,
      )
      expect(data.error).toContain(Object.keys(extra)[0])
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test('rejects the full body transformHarvestLotToBackend sends (processors must send only the four fields)', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await put({
        farmerName: 'Somchai',
        ...processorEdit,
        status: 'ReadyForProcessing',
        cropYearId: null,
        farmId: 'farm-1',
      })

      expect(status).toBe(403)
      expect(data.error).toContain('farmerName, status, cropYearId, farmId')
    })

    test.each([
      ['weight 0', { weightKg: 0 }, 'Weight must be greater than 0'],
      ['negative weight', { weightKg: -5 }, 'Weight must be greater than 0'],
      ['non-numeric weight', { weightKg: 'abc' }, 'Weight must be a number greater than 0'],
      ['partly numeric weight', { weightKg: '12kg' }, 'Weight must be a number greater than 0'],
      ['null weight', { weightKg: null }, 'Weight must be a number greater than 0'],
      ['infinite weight', { weightKg: '1' + '0'.repeat(400) }, 'Weight must be a number greater than 0'],
      ['blank variety', { cherryVariety: '   ' }, 'Cherry variety cannot be empty'],
      ['non-text plot', { farmPlotLocation: 12 }, 'Plot location must be text'],
      ['blank plot', { farmPlotLocation: '' }, 'Plot location cannot be empty'],
      ['malformed date', { harvestDate: 'March 3' }, 'Harvest date must be a date like 2026-09-23'],
      ['impossible date', { harvestDate: '2025-02-30' }, 'Harvest date must be a valid date'],
      ['future date', { harvestDate: '2099-01-01' }, 'Harvest date cannot be in the future'],
    ])('returns 400 for %s', async (_label, body, message) => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await put(body)

      expect(status).toBe(400)
      expect(data.error).toBe(message)
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test('returns 400 when nothing editable is sent', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await put({})

      expect(status).toBe(400)
      expect(data.error).toMatch(/^Nothing to update/)
    })

    test('returns 400 for a body that is not JSON', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await put('not json')

      expect(status).toBe(400)
      expect(data.error).toBe('Invalid JSON body')
    })
  })

  describe('DELETE /api/harvest-lots/[id] as Processor', () => {
    test('deletes a ready lot with a delete that only matches an unprocessed lot', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status, data } = await del()

      expect(status).toBe(200)
      expect(data.message).toBe('Harvest lot deleted successfully')
      expect(mockPrisma.harvestLot.deleteMany).toHaveBeenCalledWith({ where: unprocessedWhere })
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
    })

    test.each(processedLots)('returns 409 when the lot %s', async (_label, lot) => {
      mockAuthUser = processor
      mockLots({ access: lot })

      const { status, data } = await del()

      expect(status).toBe(409)
      expect(data.error).toBe(
        'This cherry lot has already been processed, so a processor can no longer delete it',
      )
      expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
    })

    test('returns 409 when the lot is processed between the read and the delete', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot, stillThere: true })
      mockPrisma.harvestLot.deleteMany.mockResolvedValueOnce({ count: 0 })

      const { status } = await del()

      expect(status).toBe(409)
    })
  })

  describe('other roles are still forbidden', () => {
    test.each([
      ['Roaster', roaster],
      ['Cupper', cupper],
      ['a different Farmer', otherFarmer],
    ])('%s gets 403 on PUT and DELETE of a ready lot', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: readyLot })

      expect((await put(processorEdit)).status).toBe(403)
      expect((await del()).status).toBe(403)
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
    })

    test('unauthenticated requests get 401', async () => {
      mockLots({ access: readyLot })

      expect((await put(processorEdit)).status).toBe(401)
      expect((await del()).status).toBe(401)
    })

    test('a missing lot is 404 for a Processor', async () => {
      mockAuthUser = processor
      mockPrisma.harvestLot.findUnique.mockResolvedValue(null)

      expect((await put(processorEdit)).status).toBe(404)
      expect((await del()).status).toBe(404)
    })
  })

  // The owner rules themselves are covered in harvest-lot-owner-edit.test.ts.
  describe('owner farmer and Admin take the owner path, not the processor one', () => {
    const ownerPathUsers: Array<[string, any]> = [
      ['owner Farmer', ownerFarmer],
      ['owner Farmer who is also a Processor', { ...ownerFarmer, roles: ['Farmer', 'Processor'] }],
      ['Admin', admin],
      ['Admin who is also a Processor', { ...admin, roles: ['Admin', 'Processor'] }],
      ['super admin', superAdmin],
    ]
    const processedLot = { ...readyLot, status: 'Complete', _count: { processingBatches: 1, parchmentLots: 1 } }

    test.each(ownerPathUsers)('%s can change the farmer name of a processed lot', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: processedLot })

      const { status } = await put({ farmerName: 'Somchai K.' })

      expect(status).toBe(200)
      expect(mockRequireOwnership).toHaveBeenCalledWith(user, OWNER_ID, ['Admin'])
      expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOT_ID },
          data: { farmerName: 'Somchai K.' },
        }),
      )
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test.each(ownerPathUsers.slice(0, 2))('%s cannot change the weight or status of a processed lot', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: processedLot })

      const weight = await put({ farmerName: 'Somchai K.', weightKg: 200 })
      const status = await put({ status: 'ReadyForProcessing' })

      for (const response of [weight, status]) {
        expect(response.status).toBe(409)
        expect(response.data.error).toBe(
          'This lot has already been processed, so its weight and status are locked',
        )
      }
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    // Admins may correct the weight, but not the status (owner-edit tests).
    test.each(ownerPathUsers.slice(2))('%s can correct the weight of a processed lot, not its status', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: processedLot })

      const status = await put({ status: 'ReadyForProcessing' })
      expect(status.status).toBe(409)
      expect(status.data.error).toBe('This lot has a processing batch or parchment lot, so its status stays Complete')

      const weight = await put({ farmerName: 'Somchai K.', weightKg: 200 })
      expect(weight.status).toBe(200)
      expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOT_ID }, data: { farmerName: 'Somchai K.', weightKg: 200 } }),
      )
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test.each([
      ['owner Farmer', ownerFarmer],
      ['Admin', admin],
    ])('%s gets 409 with the dependents instead of deleting a processed lot', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: processedLot })

      const { status, data } = await del()

      expect(status).toBe(409)
      expect(data).toEqual({
        error: 'This lot has already been processed',
        dependents: { processingBatches: 1, parchmentLots: 1, greenBeanLots: 0, withdrawals: 0 },
      })
      expect(mockRequireOwnership).toHaveBeenCalledWith(user, OWNER_ID, ['Admin'])
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('owner and Admin with ?ifUnprocessed=1 (the workbench) get the unprocessed guard', () => {
    const guardedUsers: Array<[string, any]> = [
      ['owner Farmer who is also a Processor', { ...ownerFarmer, roles: ['Farmer', 'Processor'] }],
      ['Admin', admin],
      ['Admin who is also a Processor', { ...admin, roles: ['Admin', 'Processor'] }],
      ['super admin', superAdmin],
    ]

    test.each(guardedUsers)('%s edits a ready lot with a write that only matches an unprocessed lot', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: readyLot })

      const { status, data } = await put({ weightKg: 180.5 }, { guarded: true })

      expect(status).toBe(200)
      expect(mockRequireOwnership).toHaveBeenCalledWith(user, OWNER_ID, ['Admin'])
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
        where: unprocessedWhere,
        data: { weightKg: 180.5 },
      })
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(data.harvestLot).toMatchObject({ id: LOT_ID })
    })

    test.each(guardedUsers)('%s deletes a ready lot with a delete that only matches an unprocessed lot', async (_label, user) => {
      mockAuthUser = user
      mockLots({ access: readyLot })

      const { status } = await del({ guarded: true })

      expect(status).toBe(200)
      expect(mockPrisma.harvestLot.deleteMany).toHaveBeenCalledWith({ where: unprocessedWhere })
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
    })

    test.each(processedLots)('Admin gets 409 and nothing is written when the lot %s', async (_label, lot) => {
      mockAuthUser = admin
      mockLots({ access: lot })

      const edit = await put({ weightKg: 200 }, { guarded: true })
      const removal = await del({ guarded: true })

      expect(edit.status).toBe(409)
      expect(edit.data.error).toBe('This cherry lot has already been processed, so it was not changed')
      expect(removal.status).toBe(409)
      expect(removal.data.error).toBe('This cherry lot has already been processed, so it was not deleted')
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
    })

    test('Admin gets 409 when the lot is processed between the read and the write', async () => {
      mockAuthUser = admin
      mockLots({ access: readyLot, stillThere: true })
      mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })
      mockPrisma.harvestLot.deleteMany.mockResolvedValueOnce({ count: 0 })

      expect((await put({ weightKg: 200 }, { guarded: true })).status).toBe(409)
      expect((await del({ guarded: true })).status).toBe(409)
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.delete).not.toHaveBeenCalled()
    })

    test('Admin gets 404 when the lot is deleted between the read and the write', async () => {
      mockAuthUser = admin
      mockLots({ access: readyLot, stillThere: false })
      mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })
      mockPrisma.harvestLot.deleteMany.mockResolvedValueOnce({ count: 0 })

      expect((await put({ weightKg: 200 }, { guarded: true })).status).toBe(404)
      expect((await del({ guarded: true })).status).toBe(404)
    })

    test('the flag does not let a different Farmer through', async () => {
      mockAuthUser = otherFarmer
      mockLots({ access: readyLot })

      expect((await put({ weightKg: 200 }, { guarded: true })).status).toBe(403)
      expect((await del({ guarded: true })).status).toBe(403)
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.deleteMany).not.toHaveBeenCalled()
    })

    test('a Processor with the flag still gets the restricted processor path', async () => {
      mockAuthUser = processor
      mockLots({ access: readyLot })

      const { status } = await put({ farmerName: 'Someone else' }, { guarded: true })

      expect(status).toBe(403)
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })
  })
})
