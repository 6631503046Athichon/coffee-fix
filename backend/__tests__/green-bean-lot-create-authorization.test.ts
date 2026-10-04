/**
 * Who may create a green bean lot, and from which parchment lot.
 *
 * POST /api/green-bean-lots sets createdById to the caller, and the lot's
 * creator owns it from then on (they pass requireOwnership on
 * /api/green-bean-lots/[id]/withdrawals). So a lot that names a parchment
 * lot must name one the caller owns (parchmentLot -> processingBatch
 * .createdById), or Admin / super admin. Otherwise anyone could mint a lot
 * that traces back to another processor's batch and farm and sell it as
 * their own. Internal lots are the Processor's (and Admin's); a Roaster adds
 * the External lots they buy.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemorySequence } from './helpers/memorySequence'

// lib/documentSequence's counter: nextDisplayId takes its numbers here.
const mockSequence = createMemorySequence()

const mockPrisma: any = {
  $queryRaw: jest.fn(mockSequence.queryRaw),
  greenBeanLot: {
    findMany: jest.fn(async () => []),
    create: jest.fn(async (args: any) => ({ id: 'new-lot', ...args.data })),
  },
  parchmentLot: {
    findUnique: jest.fn(),
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
const roasterProcessor = { id: 'roaster-2', roles: ['Roaster', 'Processor'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }

// Parchment lots by id, with the creator of their processing batch.
const PROCESSOR_1_LOT = '11111111-1111-4111-8111-111111111111'
const ROASTER_1_LOT = '22222222-2222-4222-8222-222222222222'
const ROASTER_2_LOT = '33333333-3333-4333-8333-333333333333'
const NO_BATCH_LOT = '44444444-4444-4444-8444-444444444444'
const MISSING_LOT = '55555555-5555-4555-8555-555555555555'

const parchmentLots: Record<string, { processingBatch: { createdById: string } | null }> = {
  [PROCESSOR_1_LOT]: { processingBatch: { createdById: 'processor-1' } },
  // A user who processed this batch and has since lost the Processor role.
  [ROASTER_1_LOT]: { processingBatch: { createdById: 'roaster-1' } },
  [ROASTER_2_LOT]: { processingBatch: { createdById: 'roaster-2' } },
  // An External parchment lot: no processing batch, so no owner but Admin.
  [NO_BATCH_LOT]: { processingBatch: null },
}

const internalLot = (parchmentLotId: string) => ({
  sourceType: 'Internal',
  parchmentLotId,
  grade: 'Grade A',
  initialWeightKg: 1000,
})

const externalLot = (parchmentLotId?: string) => ({
  sourceType: 'External',
  ...(parchmentLotId ? { parchmentLotId } : {}),
  grade: 'Grade A',
  initialWeightKg: 60,
  externalSource: { originName: 'Ethiopia', variety: 'Heirloom', processType: 'Washed' },
})

async function createLot(body: unknown) {
  const { POST } = await import('@/app/api/green-bean-lots/route')
  const request = new NextRequest('http://localhost:3001/api/green-bean-lots', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSequence.reset()
  mockAuthUser = null
  mockPrisma.parchmentLot.findUnique.mockImplementation(
    async (args: any) => parchmentLots[args.where.id] ?? null,
  )
})

describe('POST /api/green-bean-lots - parchment lot ownership', () => {
  test.each([
    ['a Processor', otherProcessor],
    ['a Roaster', roaster],
  ])('%s cannot create an Internal lot from another processor\'s parchment lot', async (_label, user) => {
    mockAuthUser = user
    const response = await createLot(internalLot(PROCESSOR_1_LOT))

    expect(response.status).toBe(403)
    expect(mockPrisma.greenBeanLot.create).not.toHaveBeenCalled()
  })

  test.each([
    ['a Processor', otherProcessor],
    ['a Roaster', roaster],
  ])('%s cannot attach another processor\'s parchment lot to an External lot', async (_label, user) => {
    mockAuthUser = user
    const response = await createLot(externalLot(PROCESSOR_1_LOT))

    expect(response.status).toBe(403)
    expect(mockPrisma.greenBeanLot.create).not.toHaveBeenCalled()
  })

  test('a Processor cannot create a lot from a parchment lot with no processing batch', async () => {
    mockAuthUser = processor
    const response = await createLot(internalLot(NO_BATCH_LOT))

    expect(response.status).toBe(403)
    expect(mockPrisma.greenBeanLot.create).not.toHaveBeenCalled()
  })

  test('an unknown parchment lot is 404, not a lot pointing at nothing', async () => {
    mockAuthUser = admin
    const response = await createLot(internalLot(MISSING_LOT))

    expect(response.status).toBe(404)
    expect(mockPrisma.greenBeanLot.create).not.toHaveBeenCalled()
  })

  test('a Processor creates an Internal lot from their own parchment lot', async () => {
    mockAuthUser = processor
    const response = await createLot(internalLot(PROCESSOR_1_LOT))

    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create).toHaveBeenCalledTimes(1)
    const { data } = (mockPrisma.greenBeanLot.create.mock.calls[0] as any[])[0]
    expect(data.parchmentLotId).toBe(PROCESSOR_1_LOT)
    expect(data.createdById).toBe('processor-1')
  })

  test.each([
    ['Admin', admin, PROCESSOR_1_LOT],
    ['super admin', superAdmin, PROCESSOR_1_LOT],
    ['Admin', admin, NO_BATCH_LOT],
    ['super admin', superAdmin, NO_BATCH_LOT],
  ])('%s creates an Internal lot from any parchment lot (%#)', async (_label, user, lotId) => {
    mockAuthUser = user
    const response = await createLot(internalLot(lotId))

    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/green-bean-lots - Internal lots are Processor and Admin only', () => {
  test('a Roaster without the Processor role cannot create an Internal lot, even from a batch they own', async () => {
    mockAuthUser = roaster
    const response = await createLot(internalLot(ROASTER_1_LOT))

    expect(response.status).toBe(403)
    expect(mockPrisma.greenBeanLot.create).not.toHaveBeenCalled()
  })

  test('a Roaster who is also a Processor creates an Internal lot from their own batch', async () => {
    mockAuthUser = roasterProcessor
    const response = await createLot(internalLot(ROASTER_2_LOT))

    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create).toHaveBeenCalledTimes(1)
  })

  test('a Roaster still adds an External lot they bought', async () => {
    mockAuthUser = roaster
    const response = await createLot(externalLot())

    expect(response.status).toBe(201)
    expect(mockPrisma.parchmentLot.findUnique).not.toHaveBeenCalled()
    const { data } = (mockPrisma.greenBeanLot.create.mock.calls[0] as any[])[0]
    expect(data.sourceType).toBe('External')
    expect(data.parchmentLotId).toBeNull()
    expect(data.createdById).toBe('roaster-1')
  })
})
