/**
 * Deleting lots and batches around voided withdrawals (D7 with F24).
 *
 * - A voided withdrawal never happened, so it does not keep a green bean
 *   lot, a parchment lot or a batch from being deleted: the void row goes
 *   with the record (the schema cascades withdrawals).
 * - A green bean lot a Hull & Grade made is never deleted on its own, Admin
 *   included: that would lose the hull's parchment kg and leave the hull
 *   impossible to void. Voiding the Hull & Grade is the way to remove it.
 *
 * These run against an in-memory database (helpers/memoryPrisma). The DELETE
 * routes write with one statement outside a transaction, so the client here
 * can write too.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemoryPrisma } from './helpers/memoryPrisma'

const mockDb = createMemoryPrisma()

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  get default() {
    return { ...mockDb.tx, $transaction: mockDb.client.$transaction }
  },
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
    const [status, message] =
      error.message === 'Unauthorized'
        ? [401, 'Unauthorized']
        : error.message === 'Insufficient permissions'
          ? [403, 'Forbidden']
          : [500, error.message]
    return new Response(JSON.stringify({ error: message }), { status })
  }),
}))

const user = (id: string, name: string, roles: string[]) => ({
  id,
  name,
  roles,
  isActive: true,
  isSuperAdmin: false,
})

const processor = user('processor-1', 'Processor One', ['Processor'])
const admin = user('admin-1', 'Admin', ['Admin'])

const PARCHMENT = 'pl-1'

const post = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost:3001/api${path}`, {
    method: 'POST',
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  })
const del = (path: string) => new NextRequest(`http://localhost:3001/api${path}`, { method: 'DELETE' })

async function recordGreen(lotId: string, body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')
  const response = await POST(post(`/green-bean-lots/${lotId}/withdrawals`, { purpose: 'Test', ...body }), {
    params: Promise.resolve({ id: lotId }),
  })
  expect(response.status).toBe(201)
  const rows = mockDb.rows('greenBeanWithdrawal')
  return rows[rows.length - 1]
}

async function recordParchment(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
  const response = await POST(post(`/parchment-lots/${PARCHMENT}/withdrawals`, { purpose: 'Test', ...body }), {
    params: Promise.resolve({ id: PARCHMENT }),
  })
  expect(response.status).toBe(201)
  const rows = mockDb.rows('parchmentWithdrawal')
  return rows[rows.length - 1]
}

async function voidGreen(lotId: string, withdrawalId: string) {
  const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/[withdrawalId]/void/route')
  return POST(post(`/green-bean-lots/${lotId}/withdrawals/${withdrawalId}/void`, {}), {
    params: Promise.resolve({ id: lotId, withdrawalId }),
  })
}

async function voidParchment(withdrawalId: string) {
  const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/[withdrawalId]/void/route')
  return POST(post(`/parchment-lots/${PARCHMENT}/withdrawals/${withdrawalId}/void`, {}), {
    params: Promise.resolve({ id: PARCHMENT, withdrawalId }),
  })
}

async function deleteGreen(id: string) {
  const { DELETE } = await import('@/app/api/green-bean-lots/[id]/route')
  return DELETE(del(`/green-bean-lots/${id}`), { params: Promise.resolve({ id }) })
}

async function deleteParchment() {
  const { DELETE } = await import('@/app/api/parchment-lots/[id]/route')
  return DELETE(del(`/parchment-lots/${PARCHMENT}`), { params: Promise.resolve({ id: PARCHMENT }) })
}

async function deleteBatch() {
  const { DELETE } = await import('@/app/api/processing-batches/[id]/route')
  return DELETE(del('/processing-batches/pb-1'), { params: Promise.resolve({ id: 'pb-1' }) })
}

const hullAndGrade = {
  amountKg: 50,
  withdrawalType: 'HullAndGrade',
  totalGreenBeanWeight: 38,
  gradedLots: [
    { grade: 'AA', weight: 20 },
    { grade: 'A', weight: 18 },
  ],
}

const parchmentLot = () => mockDb.get('parchmentLot', PARCHMENT)

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.reset()
  mockAuthUser = processor
  for (const u of [processor, admin]) mockDb.seed('user', { ...u })
  mockDb.seed('harvestLot', { id: 'hl-1', status: 'Complete' })
  mockDb.seed('processingBatch', { id: 'pb-1', harvestLotId: 'hl-1', createdById: 'processor-1' })
  mockDb.seed('parchmentLot', {
    id: PARCHMENT,
    displayId: 'PL-2026-1',
    processingBatchId: 'pb-1',
    sourceType: 'Internal',
    initialWeightKg: 50,
    currentWeightKg: 50,
    moistureContent: 11,
    processType: 'Washed',
    status: 'AwaitingHulling',
  })
})

describe('a green bean lot a Hull & Grade made', () => {
  test.each([
    ['its owner', processor],
    ['an Admin', admin],
  ])('is not deleted by %s (409 pointing to Void), and voiding the hull removes it', async (_who, actor) => {
    const hull = await recordParchment(hullAndGrade)
    const made = mockDb.rows('greenBeanLot').find(lot => lot.grade === 'AA')!
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 0, status: 'Hulled' })

    mockAuthUser = actor
    const response = await deleteGreen(made.id)
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toContain('made by a Hull & Grade of parchment lot PL-2026-1')
    expect(body.error).toContain('Void that Hull & Grade')
    expect(body.parchmentLotId).toBe(PARCHMENT)
    expect(mockDb.get('greenBeanLot', made.id)).toBeDefined()

    // The hull can still be voided: its lots go and the parchment comes back.
    mockAuthUser = processor
    expect((await voidParchment(hull.id)).status).toBe(200)
    expect(mockDb.rows('greenBeanLot')).toEqual([])
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
  })

  test('hulled before the lots were linked (no parchmentWithdrawalId) is not deleted either', async () => {
    mockDb.seed('greenBeanLot', {
      id: 'gbl-old',
      displayId: 'GBL-2026-1',
      sourceType: 'Internal',
      parchmentLotId: PARCHMENT,
      parchmentWithdrawalId: null,
      grade: 'AA',
      initialWeightKg: 20,
      currentWeightKg: 20,
      availabilityStatus: 'Available',
      createdById: 'processor-1',
    })

    const response = await deleteGreen('gbl-old')
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Hull & Grade of parchment lot PL-2026-1')
    expect(mockDb.get('greenBeanLot', 'gbl-old')).toBeDefined()
  })
})

describe('a voided withdrawal does not keep a record from being deleted', () => {
  test('a green bean lot whose only withdrawal was voided is deleted, and the void row goes with it', async () => {
    mockDb.seed('greenBeanLot', {
      id: 'gbl-ext',
      displayId: 'GBL-2026-9',
      sourceType: 'External',
      parchmentLotId: null,
      grade: 'Grade A',
      initialWeightKg: 40,
      currentWeightKg: 40,
      availabilityStatus: 'Available',
      createdById: 'processor-1',
    })
    const sale = await recordGreen('gbl-ext', { amountKg: 10, withdrawalType: 'Sale' })

    const refused = await deleteGreen('gbl-ext')
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toContain('1 withdrawal')

    expect((await voidGreen('gbl-ext', sale.id)).status).toBe(200)
    expect((await deleteGreen('gbl-ext')).status).toBe(200)
    expect(mockDb.get('greenBeanLot', 'gbl-ext')).toBeUndefined()
    expect(mockDb.rows('greenBeanWithdrawal')).toEqual([])
  })

  test('a parchment lot whose only withdrawal was voided is deleted', async () => {
    const sale = await recordParchment({ amountKg: 20, withdrawalType: 'Sale' })

    expect((await deleteParchment()).status).toBe(409)
    expect((await voidParchment(sale.id)).status).toBe(200)

    expect((await deleteParchment()).status).toBe(200)
    expect(parchmentLot()).toBeUndefined()
    expect(mockDb.rows('parchmentWithdrawal')).toEqual([])
  })

  test('a batch whose Hull & Grade was voided is deleted, and its cherry lot is ready again', async () => {
    const hull = await recordParchment(hullAndGrade)

    const refused = await deleteBatch()
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toContain('1 withdrawal and 2 green bean lots')

    expect((await voidParchment(hull.id)).status).toBe(200)
    const response = await deleteBatch()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ harvestLotReleased: true, parchmentLotsDeleted: 1 })
    expect(mockDb.get('processingBatch', 'pb-1')).toBeUndefined()
    expect(parchmentLot()).toBeUndefined()
    expect(mockDb.rows('parchmentWithdrawal')).toEqual([])
    expect(mockDb.get('harvestLot', 'hl-1')!.status).toBe('ReadyForProcessing')
  })
})
