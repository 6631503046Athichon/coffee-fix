/**
 * Correcting a green bean lot a Hull & Grade made (PUT /api/green-bean-lots/:id)
 * and saving the QC Score popup's notes (PATCH /api/green-bean-lots/:id).
 *
 * - On prod, parchment PCH-2026-5 (16 kg) was hulled into GBL-2026-6 (8 kg) and
 *   GBL-2026-7 (4 kg), and editing GBL-2026-7 to 9 kg was accepted: 16 kg of
 *   parchment made 17 kg of green beans. A weight that makes the lots of one
 *   Hull & Grade outweigh the parchment it hulled is now refused (400), as
 *   the Hull & Grade itself refuses it. Older lots (no withdrawal link, before
 *   prisma/sql/005) are matched to their hull by time, or else held to all of
 *   the parchment's Hull & Grades.
 * - qcNotes (prisma/sql/008) is saved with the QC score: trimmed, at most 2000
 *   characters, empty = null, owner or Admin only.
 *
 * `@/lib/utils` is real. The check runs on the transaction client.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import {
  HULL_WEIGHT_SLACK_KG,
  exceedsHull,
  maxGreenKg,
  overHullMessage,
} from '@/lib/hullGreenWeight'

const txMock: any = {
  $queryRaw: jest.fn(),
  parchmentLot: { findUnique: jest.fn() },
  parchmentWithdrawal: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  greenBeanLot: {
    aggregate: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  pricingHistory: { create: jest.fn() },
}

const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
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
  txMock.$queryRaw.mockImplementation(async () => [])
  txMock.parchmentLot.findUnique.mockImplementation(async () => ({ id: 'pl-5', displayId: 'PCH-2026-5' }))
  txMock.greenBeanLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  txMock.greenBeanLot.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }))
  mockPrisma.greenBeanLot.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }))
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

function jsonRequest(method: string, body: unknown, id: string) {
  return new NextRequest(`http://localhost:3001/api/green-bean-lots/${id}`, {
    method,
    body: JSON.stringify(body),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function putGreen(body: unknown, id = 'gbl-7') {
  const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')
  return PUT(jsonRequest('PUT', body, id), params(id))
}
async function patchGreen(body: unknown, id = 'gbl-7') {
  const { PATCH } = await import('@/app/api/green-bean-lots/[id]/route')
  return PATCH(jsonRequest('PATCH', body, id), params(id))
}

const HULLED_AT = new Date('2026-09-20T03:00:00.000Z')
const at = (ms: number) => new Date(HULLED_AT.getTime() + ms)

// GBL-2026-7 as prod has it: 4 kg from the Hull & Grade of PCH-2026-5.
const hulledLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'gbl-7',
  initialWeightKg: 4,
  currentWeightKg: 4,
  availabilityStatus: 'Available',
  createdById: 'processor-1',
  currency: 'THB',
  sourceType: 'Internal',
  parchmentLotId: 'pl-5',
  parchmentWithdrawalId: 'pw-hull',
  createdAt: at(1_000),
  ...overrides,
})

// The 16 kg Hull & Grade; GBL-2026-6 (8 kg) is the other lot it made.
function linkedHull(otherKg = 8) {
  txMock.parchmentWithdrawal.findUnique.mockResolvedValue({
    amountKg: 16,
    voidedAt: null,
    parchmentLot: { id: 'pl-5', displayId: 'PCH-2026-5' },
  })
  txMock.greenBeanLot.aggregate.mockResolvedValue({ _sum: { initialWeightKg: otherKg } })
}

const expectNothingWritten = () => {
  expect(txMock.greenBeanLot.updateMany).not.toHaveBeenCalled()
  expect(txMock.greenBeanLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
  expect(mockPrisma.greenBeanLot.updateMany).not.toHaveBeenCalled()
}

beforeEach(() => {
  resetMocks()
  mockAuthUser = OWNER
})

// ---------------------------------------------------------------------------

describe('lib/hullGreenWeight', () => {
  const limit = { scope: 'hull' as const, parchmentKg: 16, otherGreenKg: 8, parchmentLabel: 'PCH-2026-5' }

  test('the lot may take what the parchment has left over the other lots, with the Hull & Grade slack', () => {
    expect(maxGreenKg(limit)).toBe(8)
    expect(exceedsHull(limit, 8)).toBe(false)
    expect(exceedsHull(limit, 8 + HULL_WEIGHT_SLACK_KG)).toBe(false)
    expect(exceedsHull(limit, 8.02)).toBe(true)
    expect(exceedsHull(limit, 9)).toBe(true)
    // Already over: never a negative limit.
    expect(maxGreenKg({ ...limit, otherGreenKg: 17 })).toBe(0)
  })

  test('the message names the parchment, what it hulled, the other lots and the limit', () => {
    expect(overHullMessage(limit)).toBe(
      'Green bean lots cannot weigh more than the parchment they were hulled from. ' +
        'The Hull & Grade of parchment lot PCH-2026-5 hulled 16.00 kg of parchment and its other green bean lots ' +
        'weigh 8.00 kg, so this lot can weigh at most 8.00 kg.',
    )
    expect(overHullMessage({ ...limit, scope: 'parchment' })).toMatch(/^Green bean lots .* The Hull & Grades of parchment lot PCH-2026-5/)
  })
})

describe('PUT /api/green-bean-lots/[id] — weight of a lot a Hull & Grade made', () => {
  test('refuses (400) the prod case: 4 kg -> 9 kg when the hull took 16 kg and the other lot weighs 8 kg', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot())
    linkedHull()

    const response = await putGreen({ initialWeightKg: 9 })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/hulled 16\.00 kg of parchment and its other green bean lots weigh 8\.00 kg, so this lot can weigh at most 8\.00 kg/)
    expect(body.maxWeightKg).toBe(8)
    // Counted on the transaction, the parchment lot locked first.
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1)
    expect(txMock.parchmentWithdrawal.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pw-hull' },
    }))
    expect(txMock.greenBeanLot.aggregate).toHaveBeenCalledWith({
      where: { parchmentWithdrawalId: 'pw-hull', id: { not: 'gbl-7' } },
      _sum: { initialWeightKg: true },
    })
    expectNothingWritten()
  })

  test('accepts a weight up to what the parchment allows, Admin included', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot())
    linkedHull()
    expect((await putGreen({ initialWeightKg: 8 })).status).toBe(200)
    expect(txMock.greenBeanLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'gbl-7', initialWeightKg: 4, currentWeightKg: 4 },
      data: { initialWeightKg: 8, currentWeightKg: 8 },
    })

    mockAuthUser = ADMIN
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot())
    expect((await putGreen({ initialWeightKg: 8.5 })).status).toBe(400)
  })

  test('lowering a lot is never held to the hull (it only helps), and keeps the withdrawn-kg rule', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot())
    expect((await putGreen({ initialWeightKg: 3 })).status).toBe(200)
    expect(txMock.parchmentWithdrawal.findUnique).not.toHaveBeenCalled()
    expect(txMock.$queryRaw).not.toHaveBeenCalled()

    // 3 of its 4 kg already went out: still 409 below that, before any count.
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot({ currentWeightKg: 1 }))
    const response = await putGreen({ initialWeightKg: 2 })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/3\.00 kg of this green bean lot has already been withdrawn/)
  })

  test('the grade and price alone are never held to the hull', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot())
    expect((await putGreen({ grade: 'Grade B', initialWeightKg: 4 })).status).toBe(200)
    expect(txMock.parchmentWithdrawal.findUnique).not.toHaveBeenCalled()
  })

  test('an External lot or one entered by hand without a Hull & Grade is not limited', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(
      hulledLot({ sourceType: 'External', parchmentLotId: null, parchmentWithdrawalId: null }),
    )
    expect((await putGreen({ initialWeightKg: 90 })).status).toBe(200)
    expect(txMock.parchmentWithdrawal.findUnique).not.toHaveBeenCalled()

    // An Internal lot of a parchment lot with no Hull & Grade on record.
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot({ parchmentWithdrawalId: null }))
    txMock.parchmentWithdrawal.findMany.mockResolvedValueOnce([])
    txMock.parchmentWithdrawal.aggregate.mockResolvedValueOnce({ _sum: { amountKg: null } })
    expect((await putGreen({ initialWeightKg: 90 })).status).toBe(200)
  })

  test('an older lot (no withdrawal link) is held to the one Hull & Grade recorded with it', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot({ parchmentWithdrawalId: null }))
    txMock.parchmentWithdrawal.findMany.mockResolvedValueOnce([{ amountKg: 16, createdAt: HULLED_AT }])
    txMock.greenBeanLot.aggregate.mockResolvedValueOnce({ _sum: { initialWeightKg: 8 } })

    const response = await putGreen({ initialWeightKg: 9 })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/The Hull & Grade of parchment lot PCH-2026-5 hulled 16\.00 kg/)
    expect(body.maxWeightKg).toBe(8)
    // Its siblings: the unlinked Internal lots of the parchment made with that hull.
    expect(txMock.greenBeanLot.aggregate).toHaveBeenCalledWith({
      where: {
        parchmentLotId: 'pl-5',
        parchmentWithdrawalId: null,
        sourceType: 'Internal',
        id: { not: 'gbl-7' },
        createdAt: { gte: at(-5_000), lte: at(60_000) },
      },
      _sum: { initialWeightKg: true },
    })
    expect(txMock.parchmentWithdrawal.aggregate).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  test('an older lot whose hull cannot be told is held to all of the parchment\'s Hull & Grades', async () => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot({ parchmentWithdrawalId: null }))
    // Two Hull & Grades of the parchment a minute apart.
    txMock.parchmentWithdrawal.findMany.mockResolvedValueOnce([
      { amountKg: 16, createdAt: HULLED_AT },
      { amountKg: 10, createdAt: at(50_000) },
    ])
    txMock.parchmentWithdrawal.aggregate.mockResolvedValueOnce({ _sum: { amountKg: 26 } })
    txMock.greenBeanLot.aggregate.mockResolvedValueOnce({ _sum: { initialWeightKg: 18 } })

    const response = await putGreen({ initialWeightKg: 9 })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/The Hull & Grades of parchment lot PCH-2026-5 hulled 26\.00 kg .* weigh 18\.00 kg, so this lot can weigh at most 8\.00 kg/)
    expect(txMock.parchmentWithdrawal.aggregate).toHaveBeenCalledWith({
      where: { parchmentLotId: 'pl-5', withdrawalType: 'HullAndGrade', voidedAt: null },
      _sum: { amountKg: true },
    })
    expect(txMock.greenBeanLot.aggregate).toHaveBeenCalledWith({
      where: { parchmentLotId: 'pl-5', sourceType: 'Internal', id: { not: 'gbl-7' } },
      _sum: { initialWeightKg: true },
    })

    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot({ parchmentWithdrawalId: null }))
    txMock.parchmentWithdrawal.findMany.mockResolvedValueOnce([
      { amountKg: 16, createdAt: HULLED_AT },
      { amountKg: 10, createdAt: at(50_000) },
    ])
    txMock.parchmentWithdrawal.aggregate.mockResolvedValueOnce({ _sum: { amountKg: 26 } })
    txMock.greenBeanLot.aggregate.mockResolvedValueOnce({ _sum: { initialWeightKg: 18 } })
    expect((await putGreen({ initialWeightKg: 8 })).status).toBe(200)
  })

  test('another processor still cannot correct the lot (403) and nothing is counted', async () => {
    mockAuthUser = OTHER_PROCESSOR
    mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce(hulledLot())
    expect((await putGreen({ initialWeightKg: 5 })).status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/green-bean-lots/[id] — QC notes', () => {
  beforeEach(() => {
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue({ createdById: 'processor-1' })
  })

  test('saves the notes trimmed with the score and returns them', async () => {
    const response = await patchGreen({ processorScore: 86, cuppingFlavor: 8, qcNotes: '  Stone fruit, honey  ' })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockPrisma.greenBeanLot.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'gbl-7' },
      data: { processorScore: 86, cuppingFlavor: 8, qcNotes: 'Stone fruit, honey' },
    }))
    expect(body.greenBeanLot.qcNotes).toBe('Stone fruit, honey')
  })

  test('empty or null notes clear them; notes alone are a valid update', async () => {
    await patchGreen({ processorScore: 80, qcNotes: '   ' })
    expect(mockPrisma.greenBeanLot.update.mock.calls[0][0].data).toEqual({ processorScore: 80, qcNotes: null })

    await patchGreen({ qcNotes: null })
    expect(mockPrisma.greenBeanLot.update.mock.calls[1][0].data).toEqual({ qcNotes: null })

    await patchGreen({ qcNotes: 'Clean' })
    expect(mockPrisma.greenBeanLot.update.mock.calls[2][0].data).toEqual({ qcNotes: 'Clean' })
  })

  test('without notes the score saves as before and the notes are left alone', async () => {
    await patchGreen({ processorScore: 84 })
    expect(mockPrisma.greenBeanLot.update.mock.calls[0][0].data).toEqual({ processorScore: 84 })
  })

  test.each([
    ['notes over 2000 characters', { processorScore: 80, qcNotes: 'x'.repeat(2001) }, /at most 2000 characters/],
    ['notes that are not text', { processorScore: 80, qcNotes: 42 }, /QC notes must be text/],
  ])('refuses %s (400)', async (_what, body, message) => {
    const response = await patchGreen(body)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(message)
    expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()
  })

  test('2000 characters after trimming are fine', async () => {
    expect((await patchGreen({ qcNotes: ` ${'x'.repeat(2000)} ` })).status).toBe(200)
  })

  test('same owner rule as the score: another processor gets 403, an Admin may', async () => {
    mockAuthUser = OTHER_PROCESSOR
    expect((await patchGreen({ qcNotes: 'Mine now' })).status).toBe(403)
    expect(mockPrisma.greenBeanLot.update).not.toHaveBeenCalled()

    mockAuthUser = ADMIN
    expect((await patchGreen({ qcNotes: 'Checked' })).status).toBe(200)
  })
})
