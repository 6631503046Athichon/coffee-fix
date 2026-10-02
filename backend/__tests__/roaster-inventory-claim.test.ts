/**
 * PUT /api/roaster-inventory/[id]: changing a stock row's claim moves the kg
 * between the row and its source green-bean lot in the same transaction, so a
 * claim edit can never make green beans out of nothing (or swallow the kg a
 * smaller claim gives back). Roasted kg, like the kg sales hold, are off the
 * shelf and cannot be returned or put back on it.
 *
 * Writes live only on `mockTx`, the client the transaction callback gets, so
 * a write that escaped the transaction would hit an undefined function on
 * `mockPrisma` and fail the test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockTx: any = {
  $queryRaw: jest.fn(),
  roasterInventoryItem: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  saleOrderItem: {
    aggregate: jest.fn(),
  },
  roastBatch: {
    aggregate: jest.fn(),
  },
  greenBeanLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}

const mockPrisma: any = {
  roasterInventoryItem: {
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

const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const otherRoaster = { id: 'roaster-2', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }

const INV = '2c8e7d10-3f4a-4b5c-8d6e-7f8091a2b3c4'
const LOT = 'a3bb189e-8bf9-4888-9912-ace4e6543002'

const putRequest = (body: unknown) =>
  new NextRequest(`http://localhost:3001/api/roaster-inventory/${INV}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
const routeParams = { params: Promise.resolve({ id: INV }) }

// The stock row and its lot as the transaction reads them after locking.
const setStock = ({
  claimed = 20,
  remaining = 20,
  roasted = null as number | null,
  held = null as number | null,
  lotKg = 30,
  lotInitial = 50,
  lotStatus = 'Available',
} = {}) => {
  mockTx.roasterInventoryItem.findUnique.mockResolvedValue({
    claimedWeightKg: claimed,
    remainingWeightKg: remaining,
  })
  mockTx.roastBatch.aggregate.mockResolvedValue({ _sum: { batchSizeKg: roasted } })
  mockTx.saleOrderItem.aggregate.mockResolvedValue({ _sum: { quantity: held } })
  mockTx.greenBeanLot.findUnique.mockResolvedValue({
    currentWeightKg: lotKg,
    initialWeightKg: lotInitial,
    availabilityStatus: lotStatus,
  })
}

/** [sql with ? for each value, values] for each $queryRaw call. */
const lockCalls = () =>
  mockTx.$queryRaw.mock.calls.map((call: any[]) => ({
    sql: (call[0] as string[]).join('?'),
    values: call.slice(1),
  }))

const lotWrite = () => mockTx.greenBeanLot.update.mock.calls[0]?.[0]
const stockWrite = () => mockTx.roasterInventoryItem.update.mock.calls[0]?.[0]

const expectNoWrites = () => {
  expect(mockTx.greenBeanLot.update).not.toHaveBeenCalled()
  expect(mockTx.roasterInventoryItem.update).not.toHaveBeenCalled()
}

describe('PUT /api/roaster-inventory/[id] moves claim changes to and from the source lot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = roaster
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockTx))
    mockPrisma.roasterInventoryItem.findUnique.mockResolvedValue({
      roasterId: 'roaster-1',
      greenBeanLotId: LOT,
    })
    mockTx.$queryRaw.mockResolvedValue([{ id: INV }])
    mockTx.roasterInventoryItem.update.mockImplementation(async ({ data }: any) => ({ id: INV, ...data }))
    mockTx.greenBeanLot.update.mockImplementation(async ({ data }: any) => ({ id: LOT, ...data }))
    setStock()
  })

  describe('raising the claim', () => {
    test('takes the same kg off the lot and puts them on the shelf', async () => {
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 25 }), routeParams)
      expect(response.status).toBe(200)

      expect(lotWrite()).toEqual({
        where: { id: LOT },
        data: { currentWeightKg: 25, availabilityStatus: 'Available' },
        select: { id: true, currentWeightKg: true, availabilityStatus: true },
      })
      expect(stockWrite()).toMatchObject({
        where: { id: INV },
        data: { claimedWeightKg: 25, remainingWeightKg: 25 },
      })
      const body = await response.json()
      expect(body.updatedSourceLot).toEqual({ id: LOT, currentWeightKg: 25, availabilityStatus: 'Available' })
      expect(body.inventoryItem).toMatchObject({ id: INV, claimedWeightKg: 25 })
    })

    test('locks the lot, then the stock row, before reading either', async () => {
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      await PUT(putRequest({ claimedWeightKg: 25 }), routeParams)

      const locks = lockCalls()
      expect(locks).toHaveLength(2)
      expect(locks[0].sql).toContain('FROM "GreenBeanLot"')
      expect(locks[0].sql).toContain('FOR NO KEY UPDATE')
      expect(locks[0].values).toEqual([LOT])
      expect(locks[1].sql).toContain('FROM "RoasterInventoryItem"')
      expect(locks[1].sql).toContain('FOR NO KEY UPDATE')
      expect(locks[1].values).toEqual([INV])

      const [lotLock, rowLock] = mockTx.$queryRaw.mock.invocationCallOrder
      expect(lotLock).toBeLessThan(rowLock)
      expect(rowLock).toBeLessThan(mockTx.roasterInventoryItem.findUnique.mock.invocationCallOrder[0])
      expect(rowLock).toBeLessThan(mockTx.greenBeanLot.findUnique.mock.invocationCallOrder[0])
    })

    test('with an explicit remaining, the lot still gives exactly the extra claim', async () => {
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 25, remainingWeightKg: 22 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data.currentWeightKg).toBe(25)
      expect(stockWrite().data).toEqual({ claimedWeightKg: 25, remainingWeightKg: 22 })
    })

    test('taking the last kg withdraws the lot, as a claim does', async () => {
      setStock({ lotKg: 5 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 25 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data).toEqual({ currentWeightKg: 0, availabilityStatus: 'Withdrawn' })
    })

    test('409 when the lot does not hold the extra kg, with nothing written', async () => {
      setStock({ lotKg: 3 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 25 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe('The green bean lot has only 3 kg left to claim.')
      expectNoWrites()
    })

    test('409 when the lot was withdrawn by its owner, with nothing written', async () => {
      setStock({ lotKg: 30, lotStatus: 'Withdrawn' })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 25 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe('Green bean lot is not available')
      expectNoWrites()
    })

    test("an Admin raising a roaster's claim takes the kg off the lot too", async () => {
      mockAuthUser = admin
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 26 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data.currentWeightKg).toBe(24)
      expect(stockWrite().data).toEqual({ claimedWeightKg: 26, remainingWeightKg: 26 })
    })
  })

  describe('lowering the claim', () => {
    test('returns the kg to the lot and takes them off the shelf', async () => {
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data).toEqual({ currentWeightKg: 38, availabilityStatus: 'Available' })
      expect(stockWrite().data).toEqual({ claimedWeightKg: 12, remainingWeightKg: 12 })
      expect((await response.json()).updatedSourceLot.currentWeightKg).toBe(38)
    })

    test('a withdrawn lot at 0 kg gets the kg but stays withdrawn until its owner re-lists it', async () => {
      // Claims may have emptied it, or its owner may have taken it off the
      // market on purpose; the route cannot tell which.
      setStock({ lotKg: 0, lotStatus: 'Withdrawn' })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data).toEqual({ currentWeightKg: 8, availabilityStatus: 'Withdrawn' })
    })

    test('a lot its owner withdrew with kg still on it stays withdrawn', async () => {
      setStock({ lotKg: 10, lotStatus: 'Withdrawn' })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data).toEqual({ currentWeightKg: 18, availabilityStatus: 'Withdrawn' })
    })

    test('only the unroasted kg go back; the roasted kg stay claimed', async () => {
      // 20 claimed: 8 roasted, 12 on the shelf.
      setStock({ claimed: 20, remaining: 12, roasted: 8 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 8 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data.currentWeightKg).toBe(42)
      expect(stockWrite().data).toEqual({ claimedWeightKg: 8, remainingWeightKg: 0 })
    })

    test('409 when the claim would drop below the kg already roasted', async () => {
      setStock({ claimed: 20, remaining: 12, roasted: 8 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 7 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Claimed weight cannot be less than 8 kg because 8 kg of this lot were roasted.',
      )
      expectNoWrites()
    })

    test('409 when an explicit remaining would send roasted kg back to the lot', async () => {
      // Claim 20 -> 12 and keep 12 on the shelf: 8 kg back to the lot would
      // be the 8 kg that were roasted.
      setStock({ claimed: 20, remaining: 12, roasted: 8 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12, remainingWeightKg: 12 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Remaining weight can be at most 4 kg because 8 kg of this lot were roasted.',
      )
      expectNoWrites()
    })

    test('409 when an explicit remaining would send written-off kg back to the lot', async () => {
      // 100 claimed, 80 written off: only 20 kg can go back, even when the
      // request also sets the remaining to 0.
      setStock({ claimed: 100, remaining: 20, lotKg: 0, lotInitial: 100, lotStatus: 'Withdrawn' })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 0, remainingWeightKg: 0 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Only 20 kg of this claim are still in stock, so at most that much can go back to the lot.',
      )
      expectNoWrites()
    })

    test('409 when an explicit remaining keeps the returned kg in stock as well', async () => {
      // 20 claimed, 5 written off: returning 8 leaves 7 on the shelf, not 12.
      setStock({ claimed: 20, remaining: 15 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12, remainingWeightKg: 12 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Lowering the claim sends 8 kg back to the lot, so at most 7 kg can stay in stock.',
      )
      expectNoWrites()
    })

    test('an explicit remaining below what is left after the return is a return plus a write-off', async () => {
      setStock({ claimed: 20, remaining: 20 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12, remainingWeightKg: 10 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data.currentWeightKg).toBe(38)
      expect(stockWrite().data).toEqual({ claimedWeightKg: 12, remainingWeightKg: 10 })
    })

    test('409 when the return would put the lot above its initial weight, with nothing written', async () => {
      // A claim from before claims took kg off the lot: the lot never lost
      // these 50 kg, so giving them back would make them up.
      setStock({ claimed: 50, remaining: 50, lotKg: 100, lotInitial: 100 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 0 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'The green bean lot started with 100 kg and holds 100 kg, so at most 0 kg can go back to it.',
      )
      expectNoWrites()
    })

    test('a lot its owner already put above its initial weight still takes returns', async () => {
      setStock({ lotKg: 60, lotInitial: 50 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 12 }), routeParams)
      expect(response.status).toBe(200)
      expect(lotWrite().data.currentWeightKg).toBe(68)
    })

    test('409 when it would return more than is left on the shelf', async () => {
      // 15 of the 20 kg were written off; only 5 can go back.
      setStock({ claimed: 20, remaining: 5 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ claimedWeightKg: 10 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Only 5 kg of this claim are still in stock, so at most that much can go back to the lot.',
      )
      expectNoWrites()
    })
  })

  describe('remaining alone', () => {
    test('409 when it would put roasted kg back on the shelf', async () => {
      setStock({ claimed: 20, remaining: 12, roasted: 8 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ remainingWeightKg: 20 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Remaining weight can be at most 12 kg because 8 kg of this lot were roasted.',
      )
      expectNoWrites()
    })

    test('names both roasts and sales when both took kg', async () => {
      setStock({ claimed: 20, remaining: 8, roasted: 8, held: 4 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ remainingWeightKg: 10 }), routeParams)
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Remaining weight can be at most 8 kg because 8 kg of this lot were roasted and sales hold 4 kg.',
      )
      expectNoWrites()
    })

    test('a correction within the claim leaves the lot alone and unlocked', async () => {
      setStock({ claimed: 20, remaining: 10, roasted: 8 })
      const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
      const response = await PUT(putRequest({ remainingWeightKg: 12 }), routeParams)
      expect(response.status).toBe(200)
      expect(stockWrite().data).toEqual({ remainingWeightKg: 12 })
      const locks = lockCalls()
      expect(locks).toHaveLength(1)
      expect(locks[0].sql).toContain('FROM "RoasterInventoryItem"')
      expect(mockTx.greenBeanLot.findUnique).not.toHaveBeenCalled()
      expect(mockTx.greenBeanLot.update).not.toHaveBeenCalled()
    })
  })

  test('an unchanged claim moves nothing', async () => {
    const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
    const response = await PUT(putRequest({ claimedWeightKg: 20, remainingWeightKg: 15 }), routeParams)
    expect(response.status).toBe(200)
    expect(mockTx.greenBeanLot.update).not.toHaveBeenCalled()
    expect(stockWrite().data).toEqual({ remainingWeightKg: 15 })
    expect((await response.json()).updatedSourceLot).toBeUndefined()
  })

  test("403 for another roaster's row, before the transaction", async () => {
    mockAuthUser = otherRoaster
    const { PUT } = await import('@/app/api/roaster-inventory/[id]/route')
    const response = await PUT(putRequest({ claimedWeightKg: 25 }), routeParams)
    expect(response.status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
