/**
 * F24: correcting processing batches, parchment lots and green-bean lots, and
 * deleting them only while nothing downstream depends on them.
 *
 * - PUT /api/processing-batches/:id re-weighs the batch's parchment lot in the
 *   same transaction, never below what was already withdrawn or hulled.
 * - PATCH /api/parchment-lots/:id and PUT /api/green-bean-lots/:id correct the
 *   lot weight (initialWeightKg); the kg left follows and is never set
 *   directly.
 * - The three DELETEs answer 409 with the counts when anything depends on the
 *   record, for Admin too.
 *
 * `@/lib/utils` is real. Writes are made on a separate transaction client, so
 * a write that escaped the transaction lands on mockPrisma and is caught.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import {
  describeDependents,
  kgAlreadyOut,
  reweighLot,
} from '@/lib/lotCorrections'

const txMock: any = {
  parchmentLot: {
    updateMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  processingBatch: {
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  greenBeanLot: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  pricingHistory: { create: jest.fn() },
  dryingLogEntry: { deleteMany: jest.fn() },
  harvestLot: { updateMany: jest.fn() },
}

const mockPrisma: any = {
  processingBatch: { findUnique: jest.fn(), update: jest.fn() },
  parchmentLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  greenBeanLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(txMock)),
}

function resetMocks() {
  for (const client of [txMock, mockPrisma]) {
    for (const value of Object.values(client) as any[]) {
      if (typeof value === 'function') value.mockReset()
      else for (const fn of Object.values(value) as any[]) fn.mockReset()
    }
  }
  mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(txMock))
  txMock.parchmentLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  txMock.parchmentLot.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }))
  txMock.parchmentLot.deleteMany.mockImplementation(async () => ({ count: 0 }))
  txMock.parchmentLot.count.mockImplementation(async () => 0)
  txMock.processingBatch.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }))
  txMock.processingBatch.count.mockImplementation(async () => 0)
  txMock.greenBeanLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  txMock.greenBeanLot.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }))
  txMock.harvestLot.updateMany.mockImplementation(async () => ({ count: 1 }))
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

const OWNER = { id: 'processor-1', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const OTHER_PROCESSOR = { id: 'processor-2', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const ADMIN = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const SUPER_ADMIN = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }
const ROASTER = { id: 'roaster-1', roles: ['Roaster'], isActive: true, isSuperAdmin: false }

function jsonRequest(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3001/api${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function putBatch(body: unknown, id = 'pb-1') {
  const { PUT } = await import('@/app/api/processing-batches/[id]/route')
  return PUT(jsonRequest(`/processing-batches/${id}`, 'PUT', body), params(id))
}
async function deleteBatch(id = 'pb-1') {
  const { DELETE } = await import('@/app/api/processing-batches/[id]/route')
  return DELETE(jsonRequest(`/processing-batches/${id}`, 'DELETE'), params(id))
}
async function patchParchment(body: unknown, id = 'pl-1') {
  const { PATCH } = await import('@/app/api/parchment-lots/[id]/route')
  return PATCH(jsonRequest(`/parchment-lots/${id}`, 'PATCH', body), params(id))
}
async function deleteParchment(id = 'pl-1') {
  const { DELETE } = await import('@/app/api/parchment-lots/[id]/route')
  return DELETE(jsonRequest(`/parchment-lots/${id}`, 'DELETE'), params(id))
}
async function putGreen(body: unknown, id = 'gbl-1') {
  const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
  return PUT(jsonRequest(`/green-bean-lots/${id}`, 'PUT', body), params(id))
}
async function deleteGreen(id = 'gbl-1') {
  const { DELETE } = await import('@/app/api/green-bean-lots/[id]/route')
  return DELETE(jsonRequest(`/green-bean-lots/${id}`, 'DELETE'), params(id))
}

const expectNoWritesOutsideTransaction = () => {
  expect(mockPrisma.processingBatch.update).not.toHaveBeenCalled()
  expect(mockPrisma.parchmentLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.parchmentLot.updateMany).not.toHaveBeenCalled()
  expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.greenBeanLot.updateMany).not.toHaveBeenCalled()
}

beforeEach(() => {
  resetMocks()
  mockAuthUser = OWNER
})

// ---------------------------------------------------------------------------

describe('lib/lotCorrections', () => {
  test('the kg already out is the weight minus the kg left, never negative', () => {
    expect(kgAlreadyOut({ initialWeightKg: 100, currentWeightKg: 30 })).toBe(70)
    expect(kgAlreadyOut({ initialWeightKg: 0.3, currentWeightKg: 0.1 })).toBe(0.2)
    expect(kgAlreadyOut({ initialWeightKg: 50, currentWeightKg: 60 })).toBe(0)
  })

  test('re-weighing moves the kg left by the same amount and never below what went out', () => {
    expect(reweighLot({ initialWeightKg: 100, currentWeightKg: 30 }, 120)).toEqual({
      ok: true, initialWeightKg: 120, currentWeightKg: 50, depleted: false,
    })
    expect(reweighLot({ initialWeightKg: 100, currentWeightKg: 30 }, 70)).toEqual({
      ok: true, initialWeightKg: 70, currentWeightKg: 0, depleted: true,
    })
    expect(reweighLot({ initialWeightKg: 100, currentWeightKg: 30 }, 69.99)).toEqual({ ok: false, outKg: 70 })
    // Float dust is nothing left, as in the withdrawal routes.
    expect(reweighLot({ initialWeightKg: 100, currentWeightKg: 0 }, 100.004)).toMatchObject({
      currentWeightKg: 0, depleted: true,
    })
  })

  test('describes only the non-zero counts', () => {
    expect(describeDependents({ withdrawals: 1, greenBeanLots: 0 })).toBe('1 withdrawal')
    expect(describeDependents({ withdrawals: 2, greenBeanLots: 3, roastBatches: 1 }))
      .toBe('2 withdrawals, 3 green bean lots and 1 roast batch')
  })
})

// ---------------------------------------------------------------------------

describe('PUT /api/processing-batches/[id] — the batch edit popup', () => {
  const batch = (overrides: Record<string, unknown> = {}) => ({
    createdById: 'processor-1',
    parchmentWeightKg: 80,
    dryingStartDate: new Date('2026-03-01T12:00:00.000Z'),
    dryingEndDate: new Date('2026-03-10T12:00:00.000Z'),
    harvestLot: { weightKg: 400 },
    // 30 kg already sold or hulled from the 80 kg recorded.
    parchmentLots: [{ id: 'pl-1', initialWeightKg: 80, currentWeightKg: 50 }],
    ...overrides,
  })

  test('re-weighs the batch\'s parchment lot in the same transaction, keeping what already went out', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    const response = await putBatch({ parchmentWeightKg: 90, moistureContent: 11.5 })

    expect(response.status).toBe(200)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(txMock.parchmentLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'pl-1', initialWeightKg: 80, currentWeightKg: 50 },
      data: { initialWeightKg: 90, currentWeightKg: 60, status: 'AwaitingHulling', moistureContent: 11.5 },
    })
    expect(txMock.processingBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pb-1' },
      data: { parchmentWeightKg: 90, moistureContent: 11.5 },
    }))
    expectNoWritesOutsideTransaction()
  })

  test('lowering to exactly what went out leaves the lot depleted and Hulled', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    const response = await putBatch({ parchmentWeightKg: 30 })

    expect(response.status).toBe(200)
    expect(txMock.parchmentLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { initialWeightKg: 30, currentWeightKg: 0, status: 'Hulled' },
    }))
  })

  test('refuses (409) to go below what was already withdrawn or hulled, and writes nothing', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    const response = await putBatch({ parchmentWeightKg: 25 })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/30\.00 kg of this batch's parchment has already been withdrawn/)
    expect(body.withdrawnKg).toBe(30)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('refuses (409) when the lot changed after it was read (a withdrawal in between)', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())
    txMock.parchmentLot.updateMany.mockResolvedValueOnce({ count: 0 })

    const response = await putBatch({ parchmentWeightKg: 90 })

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/changed while you were editing/)
  })

  test('refuses a parchment weight above the cherry it came from, as on create', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    const response = await putBatch({ parchmentWeightKg: 401 })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/cannot exceed the cherry lot weight/)
  })

  test('refuses (409) a weight change on a legacy batch split into several lots', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch({
      parchmentLots: [
        { id: 'pl-1', initialWeightKg: 40, currentWeightKg: 40 },
        { id: 'pl-2', initialWeightKg: 40, currentWeightKg: 40 },
      ],
    }))

    const response = await putBatch({ parchmentWeightKg: 90 })

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/2 parchment lots/)
  })

  test('carries a new process type to every parchment lot and leaves the weight alone', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    const response = await putBatch({ processType: ' Honey ', processNotes: '  Raised beds ' })

    expect(response.status).toBe(200)
    expect(txMock.parchmentLot.updateMany).toHaveBeenCalledTimes(1)
    expect(txMock.parchmentLot.updateMany).toHaveBeenCalledWith({
      where: { processingBatchId: 'pb-1' },
      data: { processType: 'Honey' },
    })
    expect(txMock.processingBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { processType: 'Honey', processNotes: 'Raised beds' },
    }))
  })

  test('moisture alone reaches the batch\'s only lot', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    expect((await putBatch({ moistureContent: 10 })).status).toBe(200)
    expect(txMock.parchmentLot.update).toHaveBeenCalledWith({
      where: { id: 'pl-1' },
      data: { moistureContent: 10 },
    })
  })

  test('checks a single new drying date against the stored other one', async () => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    const response = await putBatch({ dryingEndDate: '2026-02-20' })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/cannot be before drying start/)
  })

  test.each([
    ['an empty process type', { processType: '  ' }],
    ['an unknown status', { status: 'Ready' }],
    ['a weight that is not a number', { parchmentWeightKg: '90kg' }],
  ])('refuses %s (400)', async (_what, body) => {
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())
    expect((await putBatch(body)).status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('another processor cannot edit the batch (403)', async () => {
    mockAuthUser = OTHER_PROCESSOR
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    expect((await putBatch({ parchmentWeightKg: 90 })).status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test.each([['an Admin', ADMIN], ['a super admin', SUPER_ADMIN]])('%s can edit anyone\'s batch', async (_who, user) => {
    mockAuthUser = user
    mockPrisma.processingBatch.findUnique.mockResolvedValueOnce(batch())

    expect((await putBatch({ parchmentWeightKg: 90 })).status).toBe(200)
  })
})

// ---------------------------------------------------------------------------

describe('PATCH /api/parchment-lots/[id] — the parchment edit popup', () => {
  const lot = (overrides: Record<string, unknown> = {}) => ({
    initialWeightKg: 100,
    currentWeightKg: 60,
    processingBatchId: 'pb-1',
    processingBatch: {
      createdById: 'processor-1',
      _count: { parchmentLots: 1 },
      harvestLot: { weightKg: 400 },
    },
    ...overrides,
  })
  const external = lot({ processingBatchId: null, processingBatch: null })

  test('re-weighs the lot and keeps the batch\'s weight and moisture in step', async () => {
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())

    const response = await patchParchment({ initialWeightKg: 110, moistureContent: 11 })

    expect(response.status).toBe(200)
    expect(txMock.parchmentLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'pl-1', initialWeightKg: 100, currentWeightKg: 60 },
      data: { initialWeightKg: 110, currentWeightKg: 70, status: 'AwaitingHulling' },
    })
    expect(txMock.processingBatch.update).toHaveBeenCalledWith({
      where: { id: 'pb-1' },
      data: { parchmentWeightKg: 110, moistureContent: 11 },
    })
    expect(txMock.parchmentLot.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pl-1' },
      data: { moistureContent: 11 },
    }))
    expectNoWritesOutsideTransaction()
  })

  test('a hulled lot whose weight goes up has kg to hull again', async () => {
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot({ currentWeightKg: 0 }))

    expect((await patchParchment({ initialWeightKg: 104 })).status).toBe(200)
    expect(txMock.parchmentLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { initialWeightKg: 104, currentWeightKg: 4, status: 'AwaitingHulling' },
    }))
  })

  test('refuses (409) to go below what was already withdrawn or hulled', async () => {
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())

    const response = await patchParchment({ initialWeightKg: 39 })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/40\.00 kg of this parchment lot has already been withdrawn/)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('refuses (409) when the lot changed after it was read', async () => {
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())
    txMock.parchmentLot.updateMany.mockResolvedValueOnce({ count: 0 })

    expect((await patchParchment({ initialWeightKg: 110 })).status).toBe(409)
    expect(txMock.processingBatch.update).not.toHaveBeenCalled()
  })

  test('does not touch the batch of a legacy lot that shares it', async () => {
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot({
      processingBatch: { createdById: 'processor-1', _count: { parchmentLots: 2 }, harvestLot: { weightKg: 400 } },
    }))

    expect((await patchParchment({ initialWeightKg: 110 })).status).toBe(200)
    expect(txMock.processingBatch.update).not.toHaveBeenCalled()
  })

  test.each([
    ['the kg left', { currentWeightKg: 500 }],
    ['the status', { status: 'AwaitingHulling' }],
    ['nothing editable', { processType: 'Honey' }],
    ['a zero weight', { initialWeightKg: 0 }],
    ['a moisture over 100', { moistureContent: 101 }],
  ])('refuses %s (400)', async (_what, body) => {
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())
    expect((await patchParchment(body)).status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('another processor cannot edit the lot, and an external lot is Admin-only (403)', async () => {
    mockAuthUser = OTHER_PROCESSOR
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())
    expect((await patchParchment({ moistureContent: 11 })).status).toBe(403)

    mockAuthUser = OWNER
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(external)
    expect((await patchParchment({ moistureContent: 11 })).status).toBe(403)

    mockAuthUser = ADMIN
    mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(external)
    expect((await patchParchment({ initialWeightKg: 90 })).status).toBe(200)
    expect(txMock.processingBatch.update).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

describe('PUT /api/green-bean-lots/[id] — grade and weight', () => {
  const greenLot = (overrides: Record<string, unknown> = {}) => ({
    id: 'gbl-1',
    initialWeightKg: 50,
    currentWeightKg: 40,
    availabilityStatus: 'Available',
    createdById: 'processor-1',
    currency: 'THB',
    ...overrides,
  })

  test('changes the grade and re-weighs the lot in one transaction', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())

    const response = await putGreen({ grade: ' Grade B ', initialWeightKg: 45 })

    expect(response.status).toBe(200)
    expect(txMock.greenBeanLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'gbl-1', initialWeightKg: 50, currentWeightKg: 40 },
      data: { initialWeightKg: 45, currentWeightKg: 35 },
    })
    expect(txMock.greenBeanLot.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'gbl-1' },
      data: { grade: 'Grade B' },
    }))
    expect(txMock.pricingHistory.create).not.toHaveBeenCalled()
    expectNoWritesOutsideTransaction()
  })

  test('refuses (409) to go below what was already withdrawn, claimed or sold', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())

    const response = await putGreen({ initialWeightKg: 9.5 })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/10\.00 kg of this green bean lot has already been withdrawn/)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('a lot re-weighed down to what went out becomes Withdrawn; one refilled from empty becomes Available', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())
    expect((await putGreen({ initialWeightKg: 10 })).status).toBe(200)
    expect(txMock.greenBeanLot.update.mock.calls[0][0].data).toEqual({ availabilityStatus: 'Withdrawn' })

    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(
      greenLot({ currentWeightKg: 0, availabilityStatus: 'Withdrawn' }),
    )
    expect((await putGreen({ initialWeightKg: 55 })).status).toBe(200)
    expect(txMock.greenBeanLot.updateMany.mock.calls[1][0].data).toEqual({ initialWeightKg: 55, currentWeightKg: 5 })
    expect(txMock.greenBeanLot.update.mock.calls[1][0].data).toEqual({ availabilityStatus: 'Available' })
  })

  test('refuses (409) when the lot changed after it was read, and writes nothing else', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())
    txMock.greenBeanLot.updateMany.mockResolvedValueOnce({ count: 0 })

    expect((await putGreen({ grade: 'Grade B', initialWeightKg: 45 })).status).toBe(409)
    expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
  })

  test.each([
    ['the kg left directly', { currentWeightKg: 500 }],
    ['an empty grade', { grade: '   ' }],
    ['a weight that is not a number', { initialWeightKg: '45kg' }],
  ])('refuses %s (400)', async (_what, body) => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())
    expect((await putGreen(body)).status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('another processor and a roaster cannot correct the lot (403); an Admin can', async () => {
    mockAuthUser = OTHER_PROCESSOR
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())
    expect((await putGreen({ initialWeightKg: 45 })).status).toBe(403)

    mockAuthUser = ROASTER
    expect((await putGreen({ initialWeightKg: 45 })).status).toBe(403)

    mockAuthUser = ADMIN
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())
    expect((await putGreen({ initialWeightKg: 45 })).status).toBe(200)
  })
})

// ---------------------------------------------------------------------------

describe('Deletes refuse while anything depends on the record', () => {
  describe('DELETE /api/parchment-lots/[id]', () => {
    const lot = (counts: Record<string, number> = {}) => ({
      processingBatch: { createdById: 'processor-1' },
      _count: { greenBeanLots: 0, withdrawalHistory: 0, ...counts },
    })

    test('deletes an untouched lot with a guarded delete', async () => {
      mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())
      mockPrisma.parchmentLot.deleteMany.mockResolvedValueOnce({ count: 1 })

      expect((await deleteParchment()).status).toBe(200)
      expect(mockPrisma.parchmentLot.deleteMany).toHaveBeenCalledWith({
        where: { id: 'pl-1', greenBeanLots: { none: {} }, withdrawalHistory: { none: { voidedAt: null } } },
      })
    })

    test.each([['the owner', OWNER], ['an Admin', ADMIN]])('refuses %s with the counts (409)', async (_who, user) => {
      mockAuthUser = user
      mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot({ greenBeanLots: 2, withdrawalHistory: 1 }))

      const response = await deleteParchment()
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body.error).toBe('This parchment lot already has 2 green bean lots and 1 withdrawal, so it was not deleted')
      expect(body.dependents).toEqual({ greenBeanLots: 2, withdrawals: 1 })
      expect(mockPrisma.parchmentLot.deleteMany).not.toHaveBeenCalled()
    })

    test('refuses (409) when the lot was drawn from after the check', async () => {
      mockPrisma.parchmentLot.findUnique
        .mockResolvedValueOnce(lot())
        .mockResolvedValueOnce({ id: 'pl-1' })
      mockPrisma.parchmentLot.deleteMany.mockResolvedValueOnce({ count: 0 })

      expect((await deleteParchment()).status).toBe(409)
    })

    test('another processor cannot delete it (403)', async () => {
      mockAuthUser = OTHER_PROCESSOR
      mockPrisma.parchmentLot.findUnique.mockResolvedValueOnce(lot())

      expect((await deleteParchment()).status).toBe(403)
      expect(mockPrisma.parchmentLot.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/green-bean-lots/[id]', () => {
    const noDependents = {
      withdrawalHistory: 0,
      roasterInventory: 0,
      roastBatches: 0,
      saleOrderItems: 0,
      invoiceItems: 0,
      cuppingSamples: 0,
    }
    const greenLot = (counts: Record<string, number> = {}) => ({
      createdById: 'processor-1',
      _count: { ...noDependents, ...counts },
    })

    test('deletes a lot nothing depends on with a guarded delete', async () => {
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())
      mockPrisma.greenBeanLot.deleteMany.mockResolvedValueOnce({ count: 1 })

      expect((await deleteGreen()).status).toBe(200)
      expect(mockPrisma.greenBeanLot.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'gbl-1',
          withdrawalHistory: { none: { voidedAt: null } },
          roasterInventory: { none: {} },
          roastBatches: { none: {} },
          saleOrderItems: { none: {} },
          invoiceItems: { none: {} },
          cuppingSamples: { none: {} },
        },
      })
    })

    test.each([
      ['a sale or other withdrawal', { withdrawalHistory: 1 }, '1 withdrawal'],
      ['roaster stock and roasts', { roasterInventory: 1, roastBatches: 2 }, '1 roaster stock record and 2 roast batches'],
      ['sale order and invoice lines', { saleOrderItems: 1, invoiceItems: 1 }, '1 sale order line and 1 invoice line'],
    ])('refuses a lot with %s, Admin included (409 with counts)', async (_what, counts, words) => {
      mockAuthUser = ADMIN
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot(counts))

      const response = await deleteGreen()
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body.error).toBe(`This green bean lot already has ${words}, so it was not deleted`)
      expect(body.dependents).toMatchObject(
        Object.fromEntries(Object.entries(counts).map(([key, value]) => [key === 'withdrawalHistory' ? 'withdrawals' : key, value])),
      )
      expect(mockPrisma.greenBeanLot.deleteMany).not.toHaveBeenCalled()
    })

    test('answers 404 when the lot went away between the check and the delete', async () => {
      mockPrisma.greenBeanLot.findUnique
        .mockResolvedValueOnce(greenLot())
        .mockResolvedValueOnce(null)
      mockPrisma.greenBeanLot.deleteMany.mockResolvedValueOnce({ count: 0 })

      expect((await deleteGreen()).status).toBe(404)
    })

    test('another processor cannot delete it (403)', async () => {
      mockAuthUser = OTHER_PROCESSOR
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(greenLot())

      expect((await deleteGreen()).status).toBe(403)
      expect(mockPrisma.greenBeanLot.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/processing-batches/[id]', () => {
    test('an Admin is refused too while the batch\'s parchment was drawn from (409 with counts)', async () => {
      mockAuthUser = ADMIN
      mockPrisma.processingBatch.findUnique.mockResolvedValueOnce({
        createdById: 'processor-1',
        harvestLotId: 'hl-1',
        parchmentLots: [{ id: 'pl-1', _count: { withdrawalHistory: 1, greenBeanLots: 2 } }],
      })

      const response = await deleteBatch()
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body.dependents).toEqual({ parchmentLots: 1, withdrawals: 1, greenBeanLots: 2 })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    test('another processor cannot delete the batch (403)', async () => {
      mockAuthUser = OTHER_PROCESSOR
      mockPrisma.processingBatch.findUnique.mockResolvedValueOnce({
        createdById: 'processor-1',
        harvestLotId: 'hl-1',
        parchmentLots: [],
      })

      expect((await deleteBatch()).status).toBe(403)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })
  })
})
