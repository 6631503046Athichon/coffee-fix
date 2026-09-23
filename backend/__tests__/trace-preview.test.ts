/**
 * GET /api/green-bean-lots/[id]/trace-preview — staff preview of a lot's
 * public traceability story, and the public trace route that shares its payload.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
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
    if (!user.roles.some((role: string) => roles.includes(role)) && !user.isSuperAdmin) {
      throw new Error('Insufficient permissions')
    }
  }),
  requireOwnership: jest.fn((user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
    if (user.isSuperAdmin) return
    if (user.roles.some((role: string) => allowedRoles.includes(role))) return
    if (!ownerId || user.id !== ownerId) throw new Error('Insufficient permissions')
  }),
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized' ? 401 : error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const processor = { id: 'proc-1', roles: ['Processor'], isSuperAdmin: false }
const otherProcessor = { id: 'proc-2', roles: ['Processor'], isSuperAdmin: false }
const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }

const storyLot = {
  id: 'lot-1',
  grade: 'Grade A',
  sourceType: 'Internal',
  externalSource: null,
  cuppingFragrance: null,
  cuppingFlavor: null,
  cuppingAftertaste: null,
  cuppingAcidity: null,
  cuppingBody: null,
  cuppingBalance: null,
  cuppingOverall: null,
  cuppingUniformity: null,
  cuppingCleanCup: null,
  cuppingSweetness: null,
  parchmentLot: null,
  roastBatches: [],
}

const previewRequest = () =>
  new NextRequest('http://localhost:3001/api/green-bean-lots/lot-1/trace-preview')
const routeParams = { params: Promise.resolve({ id: 'lot-1' }) }

const mockOwner = (owner: { createdById: string; publicTraceId: string | null } | null) => {
  mockPrisma.greenBeanLot.findUnique.mockImplementation(async (args: any) => {
    if (!owner) return null
    // First call reads the owner, second reads the story.
    return args.select.createdById ? owner : storyLot
  })
}

describe('GET /api/green-bean-lots/[id]/trace-preview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
  })

  test('rejects anyone not logged in', async () => {
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    expect(response.status).toBe(401)
    expect(mockPrisma.greenBeanLot.findUnique).not.toHaveBeenCalled()
  })

  test('rejects roles that cannot publish lots', async () => {
    mockAuthUser = roaster
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    expect(response.status).toBe(403)
    expect(mockPrisma.greenBeanLot.findUnique).not.toHaveBeenCalled()
  })

  test('rejects a processor who did not create an unpublished lot', async () => {
    mockAuthUser = otherProcessor
    mockOwner({ createdById: 'proc-1', publicTraceId: null })
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    expect(response.status).toBe(403)
  })

  test('lets any processor open a lot that is already public', async () => {
    mockAuthUser = otherProcessor
    mockOwner({ createdById: 'proc-1', publicTraceId: 'pub-9' })
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    const body: any = await response.json()
    expect(response.status).toBe(200)
    expect(body.traceId).toBe('pub-9')
  })

  test('returns 404 for a lot that does not exist', async () => {
    mockAuthUser = admin
    mockOwner(null)
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    expect(response.status).toBe(404)
  })

  test('gives the owner the story with a null traceId before publishing', async () => {
    mockAuthUser = processor
    mockOwner({ createdById: 'proc-1', publicTraceId: null })
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    const body: any = await response.json()
    expect(response.status).toBe(200)
    expect(body.traceId).toBeNull()
    expect(body.lot.id).toBe('lot-1')
  })

  test('lets an admin preview any lot and returns its public id', async () => {
    mockAuthUser = admin
    mockOwner({ createdById: 'proc-1', publicTraceId: 'pub-9' })
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(previewRequest(), routeParams)
    const body: any = await response.json()
    expect(response.status).toBe(200)
    expect(body.traceId).toBe('pub-9')
  })

  test('never reads inventory or personal fields for the story', async () => {
    mockAuthUser = admin
    mockOwner({ createdById: 'proc-1', publicTraceId: null })
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    await GET(previewRequest(), routeParams)
    const storySelect = JSON.stringify(mockPrisma.greenBeanLot.findUnique.mock.calls[1][0].select)
    for (const field of ['currentWeightKg', 'availabilityStatus', 'farmerName', 'ownerNames', 'createdById', 'pricePerKg']) {
      expect(storySelect).not.toContain(field)
    }
  })
})

describe('GET /api/trace/[publicId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns the same story shape, keyed by the public id', async () => {
    mockPrisma.greenBeanLot.findFirst.mockResolvedValue(storyLot)
    const { GET } = await import('@/app/api/trace/[publicId]/route')
    const response = await GET(new NextRequest('http://localhost:3001/api/trace/pub-9'), {
      params: Promise.resolve({ publicId: 'pub-9' }),
    })
    const body: any = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ lot: storyLot, traceId: 'pub-9' })
  })

  test('returns 404 for an unknown public id', async () => {
    mockPrisma.greenBeanLot.findFirst.mockResolvedValue(null)
    const { GET } = await import('@/app/api/trace/[publicId]/route')
    const response = await GET(new NextRequest('http://localhost:3001/api/trace/nope'), {
      params: Promise.resolve({ publicId: 'nope' }),
    })
    expect(response.status).toBe(404)
  })
})
