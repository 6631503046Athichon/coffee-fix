/**
 * POST /api/processing-batches/[id]/drying-logs and
 * PUT / DELETE /api/processing-batches/[id]/drying-logs/[logId]
 *
 * The workbench's Drying log popup adds, corrects and deletes a batch's
 * readings. Only the batch's processor, or an Admin on anyone's batch, may
 * change them; a picked day is stored at 12:00 UTC; moisture and humidity are
 * percentages and a reading cannot be dated in the future. GET
 * /api/processing-batches sends every reading, oldest first, as bulk-load
 * does (bulk-load-row-caps checks that one).
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  processingBatch: { findUnique: jest.fn(), findMany: jest.fn() },
  dryingLogEntry: {
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
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
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message === 'Insufficient permissions'
          ? 403
          : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const processor = { id: 'processor-1', roles: ['Processor'], isSuperAdmin: false }
const otherProcessor = { id: 'processor-2', roles: ['Processor'], isSuperAdmin: false }
const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isSuperAdmin: true }

const DAY_MS = 24 * 60 * 60 * 1000
const noon = (day: string) => new Date(`${day}T12:00:00.000Z`)
// A day well inside the past whatever the clock says, and one that is
// clearly after today in every timezone.
const pastDay = '2026-09-20'
const futureDay = new Date(Date.now() + 3 * DAY_MS).toISOString().slice(0, 10)

const reading = { date: pastDay, moistureContent: 12.5, ambientTemp: 28, relativeHumidity: 70 }

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3001${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const batchParams = { params: Promise.resolve({ id: 'batch-1' }) }
const logParams = { params: Promise.resolve({ id: 'batch-1', logId: 'log-1' }) }

const postLog = async (body: unknown) => {
  const { POST } = await import('@/app/api/processing-batches/[id]/drying-logs/route')
  return POST(request('/api/processing-batches/batch-1/drying-logs', 'POST', body), batchParams)
}

const putLog = async (body: unknown) => {
  const { PUT } = await import('@/app/api/processing-batches/[id]/drying-logs/[logId]/route')
  return PUT(
    request('/api/processing-batches/batch-1/drying-logs/log-1', 'PUT', body),
    logParams,
  )
}

const deleteLog = async () => {
  const { DELETE } = await import('@/app/api/processing-batches/[id]/drying-logs/[logId]/route')
  return DELETE(request('/api/processing-batches/batch-1/drying-logs/log-1', 'DELETE'), logParams)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.processingBatch.findUnique.mockResolvedValue({ id: 'batch-1', createdById: 'processor-1' })
  mockPrisma.processingBatch.findMany.mockResolvedValue([])
  mockPrisma.dryingLogEntry.create.mockImplementation(async ({ data }: any) => ({ id: 'log-1', ...data }))
  mockPrisma.dryingLogEntry.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.dryingLogEntry.deleteMany.mockResolvedValue({ count: 1 })
  mockPrisma.dryingLogEntry.findUnique.mockResolvedValue({
    id: 'log-1', processingBatchId: 'batch-1', ...reading, date: noon(pastDay),
  })
})

describe('POST /api/processing-batches/[id]/drying-logs', () => {
  test('the batch\'s processor adds a reading, stored at 12:00 UTC of its day', async () => {
    mockAuthUser = processor

    const response = await postLog(reading)

    expect(response.status).toBe(201)
    expect(mockPrisma.dryingLogEntry.create).toHaveBeenCalledWith({
      data: {
        processingBatchId: 'batch-1',
        date: noon(pastDay),
        moistureContent: 12.5,
        ambientTemp: 28,
        relativeHumidity: 70,
      },
    })
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s adds one to another processor\'s batch', async (_who, user) => {
    mockAuthUser = user
    expect((await postLog(reading)).status).toBe(201)
  })

  test.each([
    ['another processor', otherProcessor],
    ['a roaster', roaster],
  ])('%s is refused', async (_who, user) => {
    mockAuthUser = user
    expect((await postLog(reading)).status).toBe(403)
    expect(mockPrisma.dryingLogEntry.create).not.toHaveBeenCalled()
  })

  test('an unknown batch is a 404', async () => {
    mockAuthUser = admin
    mockPrisma.processingBatch.findUnique.mockResolvedValue(null)
    expect((await postLog(reading)).status).toBe(404)
  })

  test.each([
    ['a missing field', { date: pastDay, moistureContent: 12, ambientTemp: 28 }],
    ['moisture over 100%', { ...reading, moistureContent: 101 }],
    ['negative moisture', { ...reading, moistureContent: -1 }],
    ['humidity over 100%', { ...reading, relativeHumidity: 140 }],
    ['an implausible temperature', { ...reading, ambientTemp: 280 }],
    ['a number with text after it', { ...reading, moistureContent: '12abc' }],
    ['a date in the future', { ...reading, date: futureDay }],
    ['a day that does not exist', { ...reading, date: '2026-02-30' }],
  ])('%s is a 400', async (_what, body) => {
    mockAuthUser = processor
    expect((await postLog(body)).status).toBe(400)
    expect(mockPrisma.dryingLogEntry.create).not.toHaveBeenCalled()
  })

  test('the limits themselves are accepted', async () => {
    mockAuthUser = processor
    expect((await postLog({ ...reading, moistureContent: 0, relativeHumidity: 100 })).status).toBe(201)
    expect((await postLog({ ...reading, moistureContent: '100' })).status).toBe(201)
  })
})

describe('PUT /api/processing-batches/[id]/drying-logs/[logId]', () => {
  test('the batch\'s processor corrects only the fields sent, matched to the batch', async () => {
    mockAuthUser = processor

    const response = await putLog({ moistureContent: 11.2 })

    expect(response.status).toBe(200)
    expect(mockPrisma.dryingLogEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', processingBatchId: 'batch-1' },
      data: { moistureContent: 11.2 },
    })
    expect((await response.json()).dryingLog).toMatchObject({ id: 'log-1' })
  })

  test('a corrected day is stored at 12:00 UTC', async () => {
    mockAuthUser = processor

    expect((await putLog({ date: '2026-09-21' })).status).toBe(200)
    expect(mockPrisma.dryingLogEntry.updateMany.mock.calls[0][0].data).toEqual({
      date: noon('2026-09-21'),
    })
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s corrects another processor\'s reading', async (_who, user) => {
    mockAuthUser = user
    expect((await putLog({ ambientTemp: 30 })).status).toBe(200)
  })

  test.each([
    ['another processor', otherProcessor],
    ['a roaster', roaster],
  ])('%s is refused', async (_who, user) => {
    mockAuthUser = user
    expect((await putLog({ ambientTemp: 30 })).status).toBe(403)
    expect(mockPrisma.dryingLogEntry.updateMany).not.toHaveBeenCalled()
  })

  test('a reading of another batch (or one deleted meanwhile) is a 404', async () => {
    mockAuthUser = admin
    mockPrisma.dryingLogEntry.updateMany.mockResolvedValue({ count: 0 })
    expect((await putLog({ ambientTemp: 30 })).status).toBe(404)
  })

  test('an unknown batch is a 404', async () => {
    mockAuthUser = admin
    mockPrisma.processingBatch.findUnique.mockResolvedValue(null)
    expect((await putLog({ ambientTemp: 30 })).status).toBe(404)
    expect(mockPrisma.dryingLogEntry.updateMany).not.toHaveBeenCalled()
  })

  test.each([
    ['nothing to change', {}],
    ['moisture over 100%', { moistureContent: 100.5 }],
    ['a date in the future', { date: futureDay }],
    ['a date that is not a date', { date: 'soon' }],
  ])('%s is a 400', async (_what, body) => {
    mockAuthUser = processor
    expect((await putLog(body)).status).toBe(400)
    expect(mockPrisma.dryingLogEntry.updateMany).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/processing-batches/[id]/drying-logs/[logId]', () => {
  test('the batch\'s processor deletes a reading of that batch', async () => {
    mockAuthUser = processor

    const response = await deleteLog()

    expect(response.status).toBe(200)
    expect(mockPrisma.dryingLogEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: 'log-1', processingBatchId: 'batch-1' },
    })
  })

  test('an Admin deletes one on another processor\'s batch', async () => {
    mockAuthUser = admin
    expect((await deleteLog()).status).toBe(200)
  })

  test.each([
    ['another processor', otherProcessor],
    ['a roaster', roaster],
  ])('%s is refused', async (_who, user) => {
    mockAuthUser = user
    expect((await deleteLog()).status).toBe(403)
    expect(mockPrisma.dryingLogEntry.deleteMany).not.toHaveBeenCalled()
  })

  test('a reading that is not on the batch is a 404', async () => {
    mockAuthUser = processor
    mockPrisma.dryingLogEntry.deleteMany.mockResolvedValue({ count: 0 })
    expect((await deleteLog()).status).toBe(404)
  })
})

describe('GET /api/processing-batches', () => {
  // The Drying log popup and Quality Insights' drying curve read every
  // reading in order; a cap (the old take: 10) would silently drop the rest.
  test.each([
    ['a processor', processor],
    ['an Admin', admin],
  ])('%s gets every drying reading of a batch, oldest first', async (_who, user) => {
    mockAuthUser = user
    const { GET } = await import('@/app/api/processing-batches/route')

    const response = await GET(request('/api/processing-batches', 'GET'))

    expect(response.status).toBe(200)
    const dryingLogs = mockPrisma.processingBatch.findMany.mock.calls[0][0].include.dryingLogs
    expect(dryingLogs).toEqual({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] })
    expect(dryingLogs).not.toHaveProperty('take')
  })
})
