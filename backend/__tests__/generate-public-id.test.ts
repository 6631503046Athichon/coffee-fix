/**
 * POST /api/green-bean-lots/[id]/generate-public-id — the public trace id is
 * printed on QR labels and invoices, so a lot that already has one keeps it
 * unless the caller explicitly asks for { regenerate: true }. Only the lot
 * creator (or Admin) may call it.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const printedAt = new Date('2026-09-01T00:00:00Z')

const generateRequest = (body?: unknown) =>
  new NextRequest('http://localhost:3001/api/green-bean-lots/lot-1/generate-public-id', {
    method: 'POST',
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
const routeParams = { params: Promise.resolve({ id: 'lot-1' }) }

const mockLot = (lot: { publicTraceId: string | null; createdById?: string } | null) => {
  mockPrisma.greenBeanLot.findUnique.mockResolvedValue(
    lot && {
      id: 'lot-1',
      createdById: lot.createdById ?? 'proc-1',
      publicTraceId: lot.publicTraceId,
      qrGeneratedAt: lot.publicTraceId ? printedAt : null,
    },
  )
}

const callRoute = async (body?: unknown) => {
  const { POST } = await import('@/app/api/green-bean-lots/[id]/generate-public-id/route')
  const response = await POST(generateRequest(body), routeParams)
  return { response, body: (await response.json()) as any }
}

const expectNoWrite = () => {
  expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.greenBeanLot.updateMany).not.toHaveBeenCalled()
}

describe('POST /api/green-bean-lots/[id]/generate-public-id', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockPrisma.greenBeanLot.update.mockImplementation(async (args: any) => ({ id: 'lot-1', ...args.data }))
    mockPrisma.greenBeanLot.updateMany.mockResolvedValue({ count: 1 })
  })

  describe('who may call it (unchanged)', () => {
    test('rejects anyone not logged in', async () => {
      const { response } = await callRoute()
      expect(response.status).toBe(401)
      expect(mockPrisma.greenBeanLot.findUnique).not.toHaveBeenCalled()
    })

    test('rejects roles that cannot publish lots', async () => {
      mockAuthUser = roaster
      const { response } = await callRoute({ regenerate: true })
      expect(response.status).toBe(403)
      expect(mockPrisma.greenBeanLot.findUnique).not.toHaveBeenCalled()
    })

    test('rejects a processor who did not create the lot, with or without regenerate', async () => {
      mockAuthUser = otherProcessor
      mockLot({ publicTraceId: null })
      expect((await callRoute()).response.status).toBe(403)

      mockLot({ publicTraceId: 'pub-old' })
      const { response, body } = await callRoute({ regenerate: true })
      expect(response.status).toBe(403)
      // A refused caller never learns the existing id.
      expect(body.publicTraceId).toBeUndefined()
      expectNoWrite()
    })

    test('returns 404 for a lot that does not exist', async () => {
      mockAuthUser = admin
      mockLot(null)
      const { response } = await callRoute()
      expect(response.status).toBe(404)
      expectNoWrite()
    })
  })

  describe('first publish', () => {
    test('mints an id for the owner, only filling an empty one', async () => {
      mockAuthUser = processor
      mockLot({ publicTraceId: null })
      const { response, body } = await callRoute()

      expect(response.status).toBe(200)
      expect(body.publicTraceId).toMatch(UUID)
      expect(body.publicUrl).toBe(`/trace/${body.publicTraceId}`)
      expect(body.greenBeanLot).toMatchObject({ id: 'lot-1', publicTraceId: body.publicTraceId })
      expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
      const write: any = mockPrisma.greenBeanLot.updateMany.mock.calls[0][0]
      expect(write.where).toEqual({ id: 'lot-1', publicTraceId: null })
      expect(write.data.publicTraceId).toBe(body.publicTraceId)
    })

    test('lets an admin publish a lot someone else created', async () => {
      mockAuthUser = admin
      mockLot({ publicTraceId: null, createdById: 'proc-1' })
      const { response, body } = await callRoute()
      expect(response.status).toBe(200)
      expect(body.publicTraceId).toMatch(UUID)
    })

    test('returns the id a concurrent request just stored instead of replacing it', async () => {
      mockAuthUser = processor
      mockPrisma.greenBeanLot.findUnique
        .mockResolvedValueOnce({ id: 'lot-1', createdById: 'proc-1', publicTraceId: null, qrGeneratedAt: null })
        .mockResolvedValueOnce({ id: 'lot-1', publicTraceId: 'pub-race', qrGeneratedAt: printedAt })
      mockPrisma.greenBeanLot.updateMany.mockResolvedValue({ count: 0 })

      const { response, body } = await callRoute()

      expect(response.status).toBe(200)
      expect(body.publicTraceId).toBe('pub-race')
      expect(body.publicUrl).toBe('/trace/pub-race')
      expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
    })
  })

  describe('a lot that already has a public id', () => {
    test('returns it unchanged when no body is sent (a stale client copy cannot replace it)', async () => {
      mockAuthUser = processor
      mockLot({ publicTraceId: 'pub-old' })
      const { response, body } = await callRoute()

      expect(response.status).toBe(200)
      expect(body.publicTraceId).toBe('pub-old')
      expect(body.publicUrl).toBe('/trace/pub-old')
      expect(body.greenBeanLot).toEqual({
        id: 'lot-1',
        publicTraceId: 'pub-old',
        qrGeneratedAt: printedAt.toISOString(),
      })
      expectNoWrite()
    })

    test('returns it unchanged for an empty body or regenerate: false', async () => {
      mockAuthUser = admin
      mockLot({ publicTraceId: 'pub-old' })
      expect((await callRoute({})).body.publicTraceId).toBe('pub-old')
      expect((await callRoute({ regenerate: false })).body.publicTraceId).toBe('pub-old')
      expectNoWrite()
    })

    test('replaces it only with regenerate: true, swapping only the id it read', async () => {
      mockAuthUser = processor
      mockLot({ publicTraceId: 'pub-old' })
      const { response, body } = await callRoute({ regenerate: true })

      expect(response.status).toBe(200)
      expect(body.publicTraceId).toMatch(UUID)
      expect(body.publicTraceId).not.toBe('pub-old')
      expect(body.publicUrl).toBe(`/trace/${body.publicTraceId}`)
      expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
      const write: any = mockPrisma.greenBeanLot.updateMany.mock.calls[0][0]
      expect(write.where).toEqual({ id: 'lot-1', publicTraceId: 'pub-old' })
      expect(write.data.publicTraceId).toBe(body.publicTraceId)
    })

    test('lets an admin regenerate a lot someone else created', async () => {
      mockAuthUser = admin
      mockLot({ publicTraceId: 'pub-old', createdById: 'proc-1' })
      const { response, body } = await callRoute({ regenerate: true })
      expect(response.status).toBe(200)
      expect(body.publicTraceId).not.toBe('pub-old')
      expect(mockPrisma.greenBeanLot.updateMany).toHaveBeenCalledTimes(1)
    })

    test('two regenerates at once end with one new id: the later gets the one that won', async () => {
      mockAuthUser = processor
      mockPrisma.greenBeanLot.findUnique
        .mockResolvedValueOnce({ id: 'lot-1', createdById: 'proc-1', publicTraceId: 'pub-old', qrGeneratedAt: printedAt })
        .mockResolvedValueOnce({ id: 'lot-1', publicTraceId: 'pub-won', qrGeneratedAt: printedAt })
      // The other request swapped pub-old first, so this swap matches nothing.
      mockPrisma.greenBeanLot.updateMany.mockResolvedValue({ count: 0 })

      const { response, body } = await callRoute({ regenerate: true })

      expect(response.status).toBe(200)
      expect(body.publicTraceId).toBe('pub-won')
      expect(body.publicUrl).toBe('/trace/pub-won')
      expect(body.greenBeanLot).toEqual({ id: 'lot-1', publicTraceId: 'pub-won', qrGeneratedAt: printedAt.toISOString() })
      expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
    })

    test('404 when the lot was deleted between the read and the swap', async () => {
      mockAuthUser = processor
      mockPrisma.greenBeanLot.findUnique
        .mockResolvedValueOnce({ id: 'lot-1', createdById: 'proc-1', publicTraceId: 'pub-old', qrGeneratedAt: printedAt })
        .mockResolvedValueOnce(null)
      mockPrisma.greenBeanLot.updateMany.mockResolvedValue({ count: 0 })

      const { response, body } = await callRoute({ regenerate: true })
      expect(response.status).toBe(404)
      expect(body.publicTraceId).toBeUndefined()
    })

    test('409 when the swap missed and the lot has no id any more', async () => {
      mockAuthUser = admin
      mockPrisma.greenBeanLot.findUnique
        .mockResolvedValueOnce({ id: 'lot-1', createdById: 'proc-1', publicTraceId: 'pub-old', qrGeneratedAt: printedAt })
        .mockResolvedValueOnce({ id: 'lot-1', publicTraceId: null, qrGeneratedAt: null })
      mockPrisma.greenBeanLot.updateMany.mockResolvedValue({ count: 0 })

      const { response, body } = await callRoute({ regenerate: true })
      expect(response.status).toBe(409)
      expect(body.error).toContain('Reload and try again')
    })
  })

  describe('bad bodies', () => {
    test('rejects a regenerate that is not true or false', async () => {
      mockAuthUser = processor
      mockLot({ publicTraceId: 'pub-old' })
      const { response, body } = await callRoute({ regenerate: 'yes' })
      expect(response.status).toBe(400)
      expect(body.error).toBe('regenerate must be true or false')
      expectNoWrite()
    })

    test('rejects a body that is not a JSON object', async () => {
      mockAuthUser = processor
      mockLot({ publicTraceId: 'pub-old' })
      expect((await callRoute('[true]')).response.status).toBe(400)
      expect((await callRoute('not json')).response.status).toBe(400)
      expectNoWrite()
    })
  })
})
