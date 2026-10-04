/**
 * Who may create a parchment lot, and on which processing batch.
 *
 * Internal parchment belongs to its processing batch's owner
 * (parchmentLot -> processingBatch.createdById): that processor withdraws,
 * hulls and edits it. So POST /api/parchment-lots may only add parchment to a
 * batch the caller owns (or Admin / super admin), and the harvest lot is the
 * batch's, never one from the body. External parchment is bought in and names
 * neither.
 *
 * `@/lib/rateLimit` is real (in-memory, reset by `__tests__/setup.ts`).
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemorySequence } from './helpers/memorySequence'

// lib/documentSequence's counter: nextDisplayId takes its numbers here.
const mockSequence = createMemorySequence()

const mockPrisma: any = {
  $queryRaw: jest.fn(mockSequence.queryRaw),
  processingBatch: {
    findUnique: jest.fn(),
  },
  parchmentLot: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async (args: any) => ({ id: 'new-parchment', ...args.data })),
  },
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
  requireOwnership: jest.fn(
    (user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
      if (user.isSuperAdmin) return
      if (user.roles.some((role: string) => allowedRoles.includes(role))) return
      if (!ownerId || user.id !== ownerId) throw new Error('Insufficient permissions')
    },
  ),
  // Same bodies as lib/middleware's handleApiError for the errors this route
  // throws: a failed role or ownership check goes out as 403.
  handleApiError: jest.fn((error: any) => {
    const [status, message] =
      error.message === 'Unauthorized'
        ? [401, 'Unauthorized']
        : error.message === 'Insufficient permissions'
          ? [403, 'Forbidden']
          : [500, error.message]
    return new Response(JSON.stringify({ error: message }), { status })
  }),
}))

const processor = { id: 'processor-1', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const otherProcessor = { id: 'processor-2', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const roaster = { id: 'roaster-1', roles: ['Roaster'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }

const BATCH_1 = '11111111-1111-4111-8111-111111111111'
const LEGACY_BATCH = '22222222-2222-4222-8222-222222222222'
const MISSING_BATCH = '33333333-3333-4333-8333-333333333333'
const HARVEST_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_HARVEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// Processing batches by id, with their creator and harvest lot.
const batches: Record<string, { createdById: string | null; harvestLotId: string }> = {
  [BATCH_1]: { createdById: 'processor-1', harvestLotId: HARVEST_1 },
  // Created before batches recorded their creator: Admin only.
  [LEGACY_BATCH]: { createdById: null, harvestLotId: HARVEST_1 },
}

const parchmentBody = (over: Record<string, unknown> = {}) => ({
  processingBatchId: BATCH_1,
  initialWeightKg: 100,
  moistureContent: 11.5,
  processType: 'Washed',
  ...over,
})

const postRequest = (body: unknown) =>
  new NextRequest('http://localhost:3001/api/parchment-lots', {
    method: 'POST',
    body: JSON.stringify(body),
  })

const createdData = () => mockPrisma.parchmentLot.create.mock.calls[0][0].data

describe('POST /api/parchment-lots', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSequence.reset()
    mockAuthUser = null
    mockPrisma.processingBatch.findUnique.mockImplementation(async ({ where }: any) => batches[where.id] ?? null)
  })

  test('a processor adds parchment to their own batch, on the batch\'s harvest lot', async () => {
    mockAuthUser = processor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody()))
    expect(response.status).toBe(201)
    expect(createdData()).toMatchObject({
      processingBatchId: BATCH_1,
      harvestLotId: HARVEST_1,
      sourceType: 'Internal',
      initialWeightKg: 100,
      currentWeightKg: 100,
    })
  })

  test("403 when a processor adds parchment to another processor's batch", async () => {
    mockAuthUser = otherProcessor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody({ harvestLotId: HARVEST_1 })))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('Forbidden')
    expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
  })

  test('403 for a processor on a batch with no recorded creator', async () => {
    mockAuthUser = processor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody({ processingBatchId: LEGACY_BATCH })))
    expect(response.status).toBe(403)
    expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])("%s may add parchment to anyone's batch", async (_who, user) => {
    mockAuthUser = user
    const { POST } = await import('@/app/api/parchment-lots/route')
    for (const processingBatchId of [BATCH_1, LEGACY_BATCH]) {
      mockPrisma.parchmentLot.create.mockClear()
      const response = await POST(postRequest(parchmentBody({ processingBatchId })))
      expect(response.status).toBe(201)
      expect(createdData()).toMatchObject({ processingBatchId, harvestLotId: HARVEST_1 })
    }
  })

  test('400 when the harvest lot is not the batch\'s, with nothing created', async () => {
    mockAuthUser = processor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody({ harvestLotId: OTHER_HARVEST })))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Harvest lot does not match the processing batch')
    expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
  })

  test('the batch\'s own harvest lot may be named', async () => {
    mockAuthUser = processor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody({ harvestLotId: HARVEST_1 })))
    expect(response.status).toBe(201)
    expect(createdData().harvestLotId).toBe(HARVEST_1)
  })

  test('404 when the batch does not exist', async () => {
    mockAuthUser = admin
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody({ processingBatchId: MISSING_BATCH })))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('Processing batch not found')
    expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
  })

  test.each([
    ['no batch', { processingBatchId: undefined }],
    ['a batch id that is not a string', { processingBatchId: { not: null } }],
  ])('400 for an internal lot with %s', async (_name, over) => {
    mockAuthUser = processor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody(over)))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Processing batch ID is required for internal parchment lots')
    expect(mockPrisma.processingBatch.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
  })

  test.each([
    ['a processing batch', { processingBatchId: BATCH_1 }],
    ['a harvest lot', { processingBatchId: undefined, harvestLotId: HARVEST_1 }],
  ])('400 for an External lot that names %s', async (_name, over) => {
    mockAuthUser = otherProcessor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody({ sourceType: 'External', ...over })))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(
      'External parchment lots cannot name a processing batch or harvest lot',
    )
    expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
  })

  test('an External lot is created with no batch or harvest lot', async () => {
    mockAuthUser = processor
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(
      postRequest(parchmentBody({ sourceType: 'External', processingBatchId: undefined, externalSource: { supplier: 'Co-op' } })),
    )
    expect(response.status).toBe(201)
    expect(createdData()).toMatchObject({
      sourceType: 'External',
      processingBatchId: null,
      harvestLotId: null,
    })
    expect(mockPrisma.processingBatch.findUnique).not.toHaveBeenCalled()
  })

  test('403 for a Roaster, before any lookup', async () => {
    mockAuthUser = roaster
    const { POST } = await import('@/app/api/parchment-lots/route')
    const response = await POST(postRequest(parchmentBody()))
    expect(response.status).toBe(403)
    expect(mockPrisma.processingBatch.findUnique).not.toHaveBeenCalled()
  })
})
