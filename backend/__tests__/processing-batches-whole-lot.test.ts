/**
 * Whole-lot consumption: creating a processing batch claims the entire
 * harvest lot (ReadyForProcessing -> Complete) with a status-conditional
 * updateMany, editing a batch never touches the lot, and deleting the last
 * batch hands the lot back.
 *
 * Only `@/lib/prisma` and `@/lib/middleware` are mocked. `@/lib/utils` is
 * deliberately real so `nextDisplayId` / `withDisplayIdRetry` / `parseDateOnly`
 * run for real (the mocked `findMany` calls feed `nextDisplayId`), and
 * `@/lib/rateLimit` is real (in-memory, reset by `__tests__/setup.ts`).
 * `handleApiError` always answers 500 so a 409 in these tests can only come
 * from the route mapping the claim sentinel itself.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  harvestLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  processingBatch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  parchmentLot: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  dryingLogEntry: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

// `jest.clearAllMocks()` keeps queued `mockResolvedValueOnce` values, so a test
// that bails early would leak its queue into the next one. Reset every fn and
// re-install the defaults instead.
function resetMockPrisma() {
  for (const value of Object.values(mockPrisma) as any[]) {
    if (typeof value === 'function') value.mockReset()
    else for (const fn of Object.values(value) as any[]) fn.mockReset()
  }
  mockPrisma.harvestLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  mockPrisma.processingBatch.findMany.mockImplementation(async () => [])
  mockPrisma.processingBatch.create.mockImplementation(async ({ data }: any) => ({
    id: 'batch-1',
    ...data,
    harvestLot: {},
    cropYear: null,
    dryingLogs: [],
    parchmentLots: [],
  }))
  mockPrisma.processingBatch.count.mockImplementation(async () => 0)
  mockPrisma.parchmentLot.findMany.mockImplementation(async () => [])
  mockPrisma.parchmentLot.create.mockImplementation(async ({ data }: any) => ({
    id: 'pch-1',
    ...data,
  }))
  mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma))
}
resetMockPrisma()

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// ---------------------------------------------------------------------------
// Middleware mock
// ---------------------------------------------------------------------------

let mockAuthUser: any = null

const mockRequireAuth = jest.fn(async () => {
  if (!mockAuthUser) throw new Error('Unauthorized')
  return mockAuthUser
})
const mockRequireRole = jest.fn()
const mockRequireOwnership = jest.fn()
// Always 500: proves the routes map 409 themselves rather than via handleApiError.
const mockHandleApiError = jest.fn(
  (error: any) => new Response(JSON.stringify({ error: error.message }), { status: 500 }),
)

jest.mock('@/lib/middleware', () => ({
  requireAuth: mockRequireAuth,
  requireRole: mockRequireRole,
  requireOwnership: mockRequireOwnership,
  handleApiError: mockHandleApiError,
}))

// ---------------------------------------------------------------------------
// Fixtures + request helpers
// ---------------------------------------------------------------------------

const PROCESSOR = {
  id: 'processor-123',
  roles: ['Processor'],
  isActive: true,
  isSuperAdmin: false,
}

const READY_LOT = {
  id: 'hl-1',
  weightKg: 100,
  remainingWeightKg: null,
  status: 'ReadyForProcessing',
  _count: { processingBatches: 0 },
}

const COMPLETED_BATCH_BODY = {
  harvestLotId: 'hl-1',
  status: 'Completed',
  processType: 'Washed',
  parchmentWeightKg: 80,
  moistureContent: 11.5,
  dryingStartDate: '2026-03-01',
  dryingEndDate: '2026-03-10',
}

const CLAIM_CALL = {
  where: { id: 'hl-1', status: 'ReadyForProcessing', processingBatches: { none: {} } },
  data: { status: 'Complete', remainingWeightKg: 0 },
}

async function postBatch(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/processing-batches/route')
  const request = new NextRequest('http://localhost:3001/api/processing-batches', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(request)
}

async function putBatch(id: string, body: Record<string, unknown>) {
  const { PUT } = await import('@/app/api/processing-batches/[id]/route')
  const request = new NextRequest(`http://localhost:3001/api/processing-batches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return PUT(request, { params: Promise.resolve({ id }) })
}

async function deleteBatch(id: string) {
  const { DELETE } = await import('@/app/api/processing-batches/[id]/route')
  const request = new NextRequest(`http://localhost:3001/api/processing-batches/${id}`, {
    method: 'DELETE',
  })
  return DELETE(request, { params: Promise.resolve({ id }) })
}

// ---------------------------------------------------------------------------

describe('Processing batches — whole-lot consumption', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetMockPrisma()
    mockAuthUser = { ...PROCESSOR }
  })

  describe('POST /api/processing-batches', () => {
    test('returns 409 and touches nothing when the harvest lot is already Complete', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({ ...READY_LOT, status: 'Complete' })

      const response = await postBatch(COMPLETED_BATCH_BODY)
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body).toEqual({ error: 'Harvest lot has already been processed' })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.processingBatch.create).not.toHaveBeenCalled()
      expect(mockHandleApiError).not.toHaveBeenCalled()
    })

    test('returns 400 when parchment weight exceeds the cherry lot weight (weightKg fallback)', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({ ...READY_LOT })

      const response = await postBatch({ ...COMPLETED_BATCH_BODY, parchmentWeightKg: 150 })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toMatch(/cannot exceed the cherry lot weight \(100\.00 kg\)/)
      expect(body.error).toMatch(/^Parchment weight \(150\.00 kg\)/)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test('rejects a legacy partial lot that is still marked Ready but already has a batch', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        ...READY_LOT,
        weightKg: 3563,
        remainingWeightKg: 2413,
        _count: { processingBatches: 1 },
      })

      const response = await postBatch({ ...COMPLETED_BATCH_BODY, parchmentWeightKg: 3000 })
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body.error).toBe('Harvest lot has already been processed')
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })

    test('uses the full input weight when an unprocessed lot has a stale partial balance', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        ...READY_LOT, weightKg: 400, remainingWeightKg: 200,
      })
      const response = await postBatch({ ...COMPLETED_BATCH_BODY, parchmentWeightKg: 250 })
      expect(response.status).toBe(201)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith(CLAIM_CALL)
      expect(mockPrisma.parchmentLot.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ initialWeightKg: 250, currentWeightKg: 250 }),
      }))
    })

    test('claims the whole lot via status-conditional updateMany and creates the parchment lot (201)', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({ ...READY_LOT })

      const response = await postBatch(COMPLETED_BATCH_BODY)
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.processingBatch).toMatchObject({
        id: 'batch-1',
        harvestLotId: 'hl-1',
        status: 'Completed',
        parchmentWeightKg: 80,
      })

      // Compare-and-set claim, exactly once, and never via harvestLot.update.
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith(CLAIM_CALL)
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()

      // The claim happens before the batch row is written.
      const claimOrder = mockPrisma.harvestLot.updateMany.mock.invocationCallOrder[0]
      const createOrder = mockPrisma.processingBatch.create.mock.invocationCallOrder[0]
      expect(claimOrder).toBeLessThan(createOrder)

      expect(mockPrisma.processingBatch.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.processingBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayId: `PB-${new Date().getFullYear()}-1`,
            harvestLotId: 'hl-1',
            status: 'Completed',
            createdById: 'processor-123',
          }),
        }),
      )

      expect(mockPrisma.parchmentLot.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.parchmentLot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            harvestLotId: 'hl-1',
            processingBatchId: 'batch-1',
            initialWeightKg: 80,
            currentWeightKg: 80,
            status: 'AwaitingHulling',
          }),
        }),
      )
    })

    test('returns 409 without creating a batch or retrying when the claim updates zero rows', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({ ...READY_LOT })
      // Lost the race: the pre-check saw ReadyForProcessing but the row flipped
      // before our UPDATE ... WHERE status = 'ReadyForProcessing' ran.
      mockPrisma.harvestLot.updateMany.mockResolvedValueOnce({ count: 0 })

      const response = await postBatch(COMPLETED_BATCH_BODY)
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body).toEqual({ error: 'Harvest lot has already been processed' })
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.processingBatch.create).not.toHaveBeenCalled()
      expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
      // Mapped by the route, not by handleApiError (which would answer 500).
      expect(mockHandleApiError).not.toHaveBeenCalled()
    })

    test('claims the lot even when the batch is not Completed and creates no parchment lot', async () => {
      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({ ...READY_LOT })

      const response = await postBatch({ harvestLotId: 'hl-1', processType: 'Natural' })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.processingBatch).toMatchObject({ id: 'batch-1', status: 'ToProcess' })
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith(CLAIM_CALL)
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockPrisma.processingBatch.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.parchmentLot.create).not.toHaveBeenCalled()
    })
  })

  describe('PUT /api/processing-batches/[id]', () => {
    test('updating parchmentWeightKg never touches the harvest lot', async () => {
      mockPrisma.processingBatch.findUnique.mockResolvedValueOnce({ createdById: 'processor-123' })
      mockPrisma.processingBatch.update.mockResolvedValueOnce({
        id: 'batch-1',
        parchmentWeightKg: 120,
        harvestLot: {},
        cropYear: null,
        dryingLogs: [],
        parchmentLots: [],
      })

      const response = await putBatch('batch-1', { parchmentWeightKg: 120 })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.processingBatch).toMatchObject({ id: 'batch-1', parchmentWeightKg: 120 })
      expect(mockRequireOwnership).toHaveBeenCalledWith(mockAuthUser, 'processor-123', ['Admin'])
      expect(mockPrisma.processingBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-1' },
          data: { parchmentWeightKg: 120 },
        }),
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/processing-batches/[id]', () => {
    const DELETABLE_BATCH = {
      id: 'batch-1',
      createdById: 'processor-123',
      harvestLotId: 'hl-1',
      parchmentLots: [],
    }

    test('releases the harvest lot when the last batch bound to it is deleted', async () => {
      mockPrisma.processingBatch.findUnique.mockResolvedValueOnce({ ...DELETABLE_BATCH })
      // processingBatch.count defaults to 0: nothing else references hl-1.

      const response = await deleteBatch('batch-1')
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.harvestLotReleased).toBe(true)
      expect(mockRequireOwnership).toHaveBeenCalledWith(mockAuthUser, 'processor-123', ['Admin'])
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockPrisma.dryingLogEntry.deleteMany).toHaveBeenCalledWith({
        where: { processingBatchId: 'batch-1' },
      })
      expect(mockPrisma.processingBatch.delete).toHaveBeenCalledWith({ where: { id: 'batch-1' } })
      expect(mockPrisma.processingBatch.count).toHaveBeenCalledWith({
        where: { harvestLotId: 'hl-1' },
      })
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
        where: { id: 'hl-1', status: 'Complete' },
        data: { status: 'ReadyForProcessing', remainingWeightKg: null },
      })
    })

    test('leaves the harvest lot alone when other batches still reference it', async () => {
      mockPrisma.processingBatch.findUnique.mockResolvedValueOnce({ ...DELETABLE_BATCH })
      mockPrisma.processingBatch.count.mockResolvedValueOnce(1)

      const response = await deleteBatch('batch-1')
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.harvestLotReleased).toBe(false)
      expect(mockPrisma.processingBatch.delete).toHaveBeenCalledWith({ where: { id: 'batch-1' } })
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
    })

    test('refuses to delete a batch that still owns parchment lots (400, nothing deleted)', async () => {
      mockPrisma.processingBatch.findUnique.mockResolvedValueOnce({
        ...DELETABLE_BATCH,
        parchmentLots: [{ id: 'pch-1' }],
      })

      const response = await deleteBatch('batch-1')
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toMatch(/linked parchment lots/)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.dryingLogEntry.deleteMany).not.toHaveBeenCalled()
      expect(mockPrisma.processingBatch.delete).not.toHaveBeenCalled()
      expect(mockPrisma.harvestLot.updateMany).not.toHaveBeenCalled()
    })
  })
})
