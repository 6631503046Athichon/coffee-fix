/**
 * Who may draw stock down through the withdrawal routes, and where it may go.
 *
 * POST /api/green-bean-lots/[id]/withdrawals and
 * POST /api/parchment-lots/[id]/withdrawals are the lot owner's tools (green:
 * greenBeanLot.createdById; parchment: processingBatch.createdById), plus
 * Admin and super admin. A Roaster used to skip the ownership check on every
 * green bean withdrawal type (a Sale included) and on parchment RoastingStock;
 * Roasters take stock through the claim route (POST /api/roaster-inventory)
 * instead. A targetRoasterId must name an existing, active Roaster.
 *
 * Writes live only on `mockTx`, the client the transaction callback gets, so
 * a write that escaped the transaction would hit an undefined function on
 * `mockPrisma` and fail the test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockTx: any = {
  greenBeanLot: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  greenBeanWithdrawal: {
    create: jest.fn(),
  },
  roasterInventoryItem: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  parchmentLot: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  parchmentWithdrawal: {
    create: jest.fn(),
  },
}

const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
  },
  parchmentLot: {
    findUnique: jest.fn(),
  },
  roasterInventoryItem: {
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(mockTx)),
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
  // Same bodies as lib/middleware's handleApiError for the errors these
  // routes throw: a failed role or ownership check goes out as 403.
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

const processor = { id: 'processor-1', name: 'Processor One', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const otherProcessor = { id: 'processor-2', name: 'Processor Two', roles: ['Processor'], isActive: true, isSuperAdmin: false }
const roaster = { id: 'roaster-1', name: 'Roaster One', roles: ['Roaster'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', name: 'Admin', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', name: 'Super', roles: [], isActive: true, isSuperAdmin: true }

// What prisma.user.findUnique returns for each target id; unknown ids are null.
const targetUsers: Record<string, { roles: string[]; isActive: boolean }> = {
  'roaster-1': { roles: ['Roaster'], isActive: true },
  'roaster-2': { roles: ['Roaster', 'Processor'], isActive: true },
  'roaster-inactive': { roles: ['Roaster'], isActive: false },
  'processor-2': { roles: ['Processor'], isActive: true },
  'admin-1': { roles: ['Admin'], isActive: true },
}

const INVALID_TARGET = 'Target roaster must be an active user with the Roaster role'

// Every value a client could send that does not name an active Roaster.
const badTargets: [string, unknown][] = [
  ['an unknown id', 'no-such-user'],
  ['a deactivated roaster', 'roaster-inactive'],
  ['a processor', 'processor-2'],
  ['an admin without the Roaster role', 'admin-1'],
  ['a number', 12345],
  ['an object', { id: 'roaster-1' }],
]

const expectNothingWritten = () => {
  expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  expect(mockTx.greenBeanLot.updateMany).not.toHaveBeenCalled()
  expect(mockTx.greenBeanWithdrawal.create).not.toHaveBeenCalled()
  expect(mockTx.roasterInventoryItem.create).not.toHaveBeenCalled()
  expect(mockTx.roasterInventoryItem.update).not.toHaveBeenCalled()
  expect(mockTx.parchmentLot.updateMany).not.toHaveBeenCalled()
  expect(mockTx.parchmentWithdrawal.create).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.user.findUnique.mockImplementation(async (args: any) => targetUsers[args.where.id] ?? null)
  mockTx.greenBeanLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  mockTx.greenBeanLot.findUnique.mockImplementation(async () => ({ currentWeightKg: 90 }))
  mockTx.greenBeanLot.update.mockImplementation(async () => ({}))
  mockTx.greenBeanWithdrawal.create.mockImplementation(async () => ({ id: 'gbw-1' }))
  mockTx.roasterInventoryItem.findFirst.mockImplementation(async () => null)
  mockTx.roasterInventoryItem.create.mockImplementation(async ({ data }: any) => ({ id: 'inv-1', ...data }))
  mockTx.parchmentLot.updateMany.mockImplementation(async () => ({ count: 1 }))
  mockTx.parchmentLot.findUnique.mockImplementation(async () => ({ currentWeightKg: 90 }))
  mockTx.parchmentLot.update.mockImplementation(async () => ({}))
  mockTx.parchmentWithdrawal.create.mockImplementation(async () => ({ id: 'pw-1' }))
  mockPrisma.roasterInventoryItem.findFirst.mockImplementation(async () => ({ id: 'inv-1' }))
})

describe('POST /api/green-bean-lots/[id]/withdrawals', () => {
  const params = { params: Promise.resolve({ id: 'gbl-1' }) }
  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')
    return POST(
      new NextRequest('http://localhost:3001/api/green-bean-lots/gbl-1/withdrawals', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { params: params.params },
    )
  }
  // A processor's green bean lot with 100 kg left, unless `createdById` says otherwise.
  const givenLot = (createdById: string | null = 'processor-1', currentWeightKg = 100) => {
    mockPrisma.greenBeanLot.findUnique.mockImplementation(async (args: any) =>
      args.include?.withdrawalHistory
        ? { id: 'gbl-1', currentWeightKg: currentWeightKg - 10, withdrawalHistory: [] }
        : { id: 'gbl-1', currentWeightKg, availabilityStatus: 'Available', createdById },
    )
  }
  const sale = { amountKg: 10, withdrawalType: 'Sale', purpose: 'Customer order', salePrice: 200 }
  const roast = (targetRoasterId: unknown = 'roaster-1') => ({
    amountKg: 10,
    withdrawalType: 'RoastingStock',
    purpose: 'Roasting',
    targetRoasterId,
  })
  const bodyFor = (withdrawalType: string) =>
    withdrawalType === 'RoastingStock'
      ? roast()
      : { amountKg: 10, withdrawalType, purpose: withdrawalType }

  beforeEach(() => givenLot())

  describe('a Roaster cannot draw down a lot someone else created', () => {
    test.each(['Sale', 'RoastingStock', 'Sample', 'Export', 'Other'])('403 for %s', async (type) => {
      mockAuthUser = roaster
      const response = await post(bodyFor(type))

      expect(response.status).toBe(403)
      expectNothingWritten()
    })

    test('403 for a Sale to themselves with a targetRoasterId', async () => {
      mockAuthUser = roaster
      const response = await post({ ...sale, targetRoasterId: 'roaster-1' })

      expect(response.status).toBe(403)
      expectNothingWritten()
    })

    test('403 on a lot with no creator', async () => {
      givenLot(null)
      mockAuthUser = roaster
      const response = await post(roast())

      expect(response.status).toBe(403)
      expectNothingWritten()
    })

    test('ownership is checked before the target roaster is looked up', async () => {
      mockAuthUser = roaster
      const response = await post(roast('no-such-user'))

      expect(response.status).toBe(403)
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
      expectNothingWritten()
    })
  })

  test.each(['Sale', 'RoastingStock'])("403 for another Processor's %s", async (type) => {
    mockAuthUser = otherProcessor
    const response = await post(bodyFor(type))

    expect(response.status).toBe(403)
    expectNothingWritten()
  })

  test('the Processor who created the lot can record a Sale', async () => {
    mockAuthUser = processor
    const response = await post(sale)

    expect(response.status).toBe(201)
    expect(mockTx.greenBeanLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'gbl-1', currentWeightKg: { gte: 10 } },
      data: { currentWeightKg: { decrement: 10 } },
    })
    expect(mockTx.greenBeanWithdrawal.create.mock.calls[0][0].data).toMatchObject({
      greenBeanLotId: 'gbl-1',
      amountKg: 10,
      withdrawalType: 'Sale',
      withdrawnBy: 'processor-1',
      totalAmount: 2000,
    })
    expect(mockTx.roasterInventoryItem.create).not.toHaveBeenCalled()
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })

  test.each([
    ['the Processor who created the lot', processor],
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s can push Roasting Stock to an active roaster', async (_label, user) => {
    mockAuthUser = user
    const response = await post(roast('roaster-1'))

    expect(response.status).toBe(201)
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'roaster-1' },
      select: { roles: true, isActive: true },
    })
    expect(mockTx.greenBeanWithdrawal.create).toHaveBeenCalledTimes(1)
    expect(mockTx.roasterInventoryItem.create).toHaveBeenCalledWith({
      data: {
        roasterId: 'roaster-1',
        greenBeanLotId: 'gbl-1',
        claimedWeightKg: 10,
        remainingWeightKg: 10,
      },
    })
  })

  test('a target holding Roaster among other roles is accepted', async () => {
    mockAuthUser = processor
    const response = await post(roast('roaster-2'))

    expect(response.status).toBe(201)
    expect(mockTx.roasterInventoryItem.create.mock.calls[0][0].data.roasterId).toBe('roaster-2')
  })

  test('an Admin can record a Sale on any lot', async () => {
    mockAuthUser = admin
    const response = await post(sale)

    expect(response.status).toBe(201)
    expect(mockTx.greenBeanWithdrawal.create).toHaveBeenCalledTimes(1)
  })

  test('a Roaster can still draw down a lot they created themselves', async () => {
    givenLot('roaster-1')
    mockAuthUser = roaster
    const response = await post(sale)

    expect(response.status).toBe(201)
    expect(mockTx.greenBeanWithdrawal.create.mock.calls[0][0].data.withdrawnBy).toBe('roaster-1')
  })

  test.each(badTargets)('400 for Roasting Stock to %s', async (_label, target) => {
    mockAuthUser = processor
    const response = await post(roast(target))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(INVALID_TARGET)
    expectNothingWritten()
  })

  test.each(badTargets)('400 for an Admin pushing Roasting Stock to %s', async (_label, target) => {
    mockAuthUser = admin
    const response = await post(roast(target))

    expect(response.status).toBe(400)
    expectNothingWritten()
  })

  test('400 for a Sale that names a target that is not a roaster', async () => {
    mockAuthUser = processor
    const response = await post({ ...sale, targetRoasterId: 'processor-2' })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(INVALID_TARGET)
    expectNothingWritten()
  })

  test('400 for Roasting Stock without a target roaster', async () => {
    mockAuthUser = processor
    const response = await post(roast(''))

    expect(response.status).toBe(400)
    expectNothingWritten()
  })

  test.each([
    ['the Processor who created the lot', processor],
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('400 when %s withdraws more than the lot holds', async (_label, user) => {
    mockAuthUser = user
    const response = await post({ ...roast(), amountKg: 100.5 })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Insufficient weight available')
    expectNothingWritten()
  })

  test('a Roaster who created the lot cannot withdraw more than it holds', async () => {
    givenLot('roaster-1', 5)
    mockAuthUser = roaster
    const response = await post(sale)

    expect(response.status).toBe(400)
    expectNothingWritten()
  })
})

describe('POST /api/parchment-lots/[id]/withdrawals', () => {
  const params = { params: Promise.resolve({ id: 'pl-1' }) }
  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
    return POST(
      new NextRequest('http://localhost:3001/api/parchment-lots/pl-1/withdrawals', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { params: params.params },
    )
  }
  // A parchment lot with 100 kg left whose batch `batchOwner` created.
  const givenLot = (batchOwner: string | null = 'processor-1', currentWeightKg = 100) => {
    mockPrisma.parchmentLot.findUnique.mockImplementation(async (args: any) =>
      args.include?.processingBatch
        ? {
            id: 'pl-1',
            currentWeightKg,
            processingBatch: batchOwner ? { createdById: batchOwner } : null,
          }
        : { id: 'pl-1', currentWeightKg: currentWeightKg - 10, withdrawalHistory: [] },
    )
  }
  const roast = (targetRoasterId: unknown = 'roaster-1') => ({
    amountKg: 10,
    withdrawalType: 'RoastingStock',
    purpose: 'Roasting',
    targetRoasterId,
  })

  beforeEach(() => givenLot())

  test("403 when a Roaster draws RoastingStock on a processor's lot", async () => {
    mockAuthUser = roaster
    const response = await post(roast('roaster-1'))

    expect(response.status).toBe(403)
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  test.each(['Sale', 'Sample', 'Export', 'Other'])("403 when a Roaster draws %s on a processor's lot", async (type) => {
    mockAuthUser = roaster
    const response = await post({ amountKg: 10, withdrawalType: type, purpose: type })

    expect(response.status).toBe(403)
    expectNothingWritten()
  })

  test('403 when a Roaster draws RoastingStock on a lot with no batch', async () => {
    givenLot(null)
    mockAuthUser = roaster
    const response = await post(roast())

    expect(response.status).toBe(403)
    expectNothingWritten()
  })

  test("403 for another Processor's RoastingStock", async () => {
    mockAuthUser = otherProcessor
    const response = await post(roast())

    expect(response.status).toBe(403)
    expectNothingWritten()
  })

  test.each([
    ['the Processor who created the batch', processor],
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s can draw RoastingStock for an active roaster', async (_label, user) => {
    mockAuthUser = user
    const response = await post(roast('roaster-1'))

    expect(response.status).toBe(201)
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'roaster-1' },
      select: { roles: true, isActive: true },
    })
    expect(mockTx.parchmentLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'pl-1', currentWeightKg: { gte: 10 } },
      data: { currentWeightKg: { decrement: 10 } },
    })
    expect(mockTx.parchmentWithdrawal.create.mock.calls[0][0].data).toMatchObject({
      parchmentLotId: 'pl-1',
      amountKg: 10,
      withdrawalType: 'RoastingStock',
      targetRoasterId: 'roaster-1',
      withdrawnBy: user.id,
    })
  })

  test.each(badTargets)('400 for RoastingStock to %s', async (_label, target) => {
    mockAuthUser = processor
    const response = await post(roast(target))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(INVALID_TARGET)
    expectNothingWritten()
  })

  test('400 for an Admin drawing RoastingStock for a deactivated roaster', async () => {
    mockAuthUser = admin
    const response = await post(roast('roaster-inactive'))

    expect(response.status).toBe(400)
    expectNothingWritten()
  })

  test('400 for a Sale that names a target that is not a roaster', async () => {
    mockAuthUser = processor
    const response = await post({ amountKg: 10, withdrawalType: 'Sale', purpose: 'Sale', targetRoasterId: 'admin-1' })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(INVALID_TARGET)
    expectNothingWritten()
  })

  test.each([
    ['the Processor who created the batch', processor],
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('400 when %s withdraws more than the lot holds', async (_label, user) => {
    mockAuthUser = user
    const response = await post({ ...roast(), amountKg: 100.5 })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Insufficient weight available')
    expectNothingWritten()
  })
})
