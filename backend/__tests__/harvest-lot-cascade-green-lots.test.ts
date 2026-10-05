/**
 * DELETE /api/harvest-lots/[id]?cascade=1 (Admin) and the green bean lots made
 * from the lot's parchment. The schema cascades the batches, parchment lots
 * and parchment withdrawals; the green bean lots used to be only unlinked,
 * left as stock with no source. Now, in the same transaction:
 * - green bean lots nothing uses are deleted with the chain, with their
 *   voided withdrawals, empty roaster stock rows and price history
 *   (lib/greenLotRemoval)
 * - if any is used (a withdrawal that still counts, roaster stock holding
 *   kg, a roast, a sale or invoice line, a cupping sample) nothing is deleted
 *   and the 409 lists those lots, for the Admin to void or settle first
 *
 * These run against an in-memory database (helpers/memoryPrisma). It does not
 * cascade a harvest lot's delete to its batches and parchment lots (the
 * database does), so the tests check the green bean lots and the lot itself.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemoryPrisma } from './helpers/memoryPrisma'

const mockDb = createMemoryPrisma()

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  get default() {
    return mockDb.client
  },
}))

let mockAuthUser: any = null

jest.mock('@/lib/middleware', () => ({
  requireAuth: jest.fn(async () => {
    if (!mockAuthUser) throw new Error('Unauthorized')
    return mockAuthUser
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

const user = (id: string, roles: string[], isSuperAdmin = false) => ({ id, name: id, roles, isActive: true, isSuperAdmin })
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const farmer = user('farmer-1', ['Farmer'])

const HARVEST = 'hl-1'

async function del(query = '?cascade=1', id = HARVEST) {
  const { DELETE } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await DELETE(
    new NextRequest(`http://localhost:3001/api/harvest-lots/${id}${query}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) },
  )
  return { status: response.status, body: await response.json() }
}

const greenLot = (id: string, parchmentLotId: string, fields: Record<string, unknown> = {}) =>
  mockDb.seed('greenBeanLot', {
    id,
    displayId: id.toUpperCase(),
    sourceType: 'Internal',
    parchmentLotId,
    grade: 'AA',
    initialWeightKg: 20,
    currentWeightKg: 20,
    availabilityStatus: 'Available',
    createdById: 'processor-1',
    ...fields,
  })

const greenIds = () => mockDb.rows('greenBeanLot').map(lot => lot.id).sort()

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.reset()
  mockAuthUser = admin
  for (const u of [admin, superAdmin, farmer]) mockDb.seed('user', { ...u })
  mockDb.seed('farm', { id: 'farm-1', ownerId: 'farmer-1' })

  // The lot being deleted: a batch, its parchment (hulled into gbl-1 and
  // gbl-2), and parchment recorded straight on the lot (hulled into gbl-3).
  mockDb.seed('harvestLot', { id: HARVEST, farmId: 'farm-1', createdById: 'farmer-1', status: 'Complete', weightKg: 100 })
  mockDb.seed('processingBatch', { id: 'pb-1', harvestLotId: HARVEST, createdById: 'processor-1' })
  mockDb.seed('parchmentLot', { id: 'pl-1', processingBatchId: 'pb-1', harvestLotId: HARVEST })
  mockDb.seed('parchmentLot', { id: 'pl-direct', processingBatchId: null, harvestLotId: HARVEST })
  mockDb.seed('parchmentWithdrawal', { id: 'pw-1', parchmentLotId: 'pl-1', amountKg: 50, withdrawalType: 'HullAndGrade' })
  greenLot('gbl-1', 'pl-1', { parchmentWithdrawalId: 'pw-1' })
  greenLot('gbl-2', 'pl-1', { parchmentWithdrawalId: 'pw-1', grade: 'A' })
  greenLot('gbl-3', 'pl-direct')

  // Another farmer's chain, which the cascade never touches.
  mockDb.seed('harvestLot', { id: 'hl-2', farmId: 'farm-1', createdById: 'farmer-1', status: 'Complete', weightKg: 80 })
  mockDb.seed('processingBatch', { id: 'pb-2', harvestLotId: 'hl-2', createdById: 'processor-1' })
  mockDb.seed('parchmentLot', { id: 'pl-2', processingBatchId: 'pb-2', harvestLotId: 'hl-2' })
  greenLot('gbl-other', 'pl-2')
})

describe('an Admin cascade-deletes a processed lot', () => {
  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s deletes the green bean lots made from it with the chain, and no other lot', async (_who, actor) => {
    mockAuthUser = actor
    const { status, body } = await del()

    expect(status).toBe(200)
    expect(body).toEqual({ message: 'Harvest lot deleted successfully', greenBeanLotsDeleted: 3 })
    expect(greenIds()).toEqual(['gbl-other'])
    expect(mockDb.get('harvestLot', HARVEST)).toBeUndefined()
    expect(mockDb.get('harvestLot', 'hl-2')).toBeDefined()
    // The parchment is locked before the green bean lots made from it.
    expect(mockDb.locks.map(lock => lock.split(' WHERE')[0])).toEqual([
      'SELECT "id" FROM "ParchmentLot"',
      'SELECT "id" FROM "GreenBeanLot"',
    ])
  })

  test("a lot's voided withdrawals, empty roaster stock row and price history go with it", async () => {
    mockDb.seed('greenBeanWithdrawal', {
      id: 'gbw-void',
      greenBeanLotId: 'gbl-1',
      amountKg: 20,
      withdrawalType: 'RoastingStock',
      targetRoasterId: 'roaster-1',
      voidedAt: new Date(),
    })
    mockDb.seed('roasterInventoryItem', {
      id: 'inv-empty',
      roasterId: 'roaster-1',
      greenBeanLotId: 'gbl-1',
      claimedWeightKg: 0,
      remainingWeightKg: 0,
    })
    mockDb.seed('pricingHistory', { id: 'ph-1', greenBeanLotId: 'gbl-1', pricePerKg: 300 })

    const { status } = await del()

    expect(status).toBe(200)
    expect(greenIds()).toEqual(['gbl-other'])
    expect(mockDb.rows('greenBeanWithdrawal')).toEqual([])
    expect(mockDb.rows('roasterInventoryItem')).toEqual([])
    expect(mockDb.rows('pricingHistory')).toEqual([])
  })

  test('the counts the Admin confirmed (?expect=) include the green bean lots', async () => {
    // 1 batch, 2 parchment lots, 3 green bean lots, 1 parchment withdrawal.
    expect((await del('?cascade=1&expect=1,2,3,0')).status).toBe(409)
    expect(greenIds()).toHaveLength(4)

    const { status } = await del('?cascade=1&expect=1,2,3,1')
    expect(status).toBe(200)
    expect(greenIds()).toEqual(['gbl-other'])
  })

  test('a lot with no green bean lots made from it is deleted as before', async () => {
    mockDb.rows('greenBeanLot').splice(0, 3)
    const { status, body } = await del()
    expect(status).toBe(200)
    expect(body.greenBeanLotsDeleted).toBe(0)
    expect(mockDb.get('harvestLot', HARVEST)).toBeUndefined()
  })
})

describe('a green bean lot made from it that is used refuses the whole cascade', () => {
  const uses: [string, () => void, string][] = [
    ['a withdrawal that still counts', () => {
      mockDb.seed('greenBeanWithdrawal', { id: 'gbw-1', greenBeanLotId: 'gbl-2', amountKg: 5, withdrawalType: 'Sale', voidedAt: null })
    }, '1 withdrawal'],
    ['roaster stock holding kg', () => {
      mockDb.seed('roasterInventoryItem', { id: 'inv-1', roasterId: 'roaster-1', greenBeanLotId: 'gbl-2', claimedWeightKg: 5, remainingWeightKg: 5 })
    }, '1 roaster stock record'],
    ['a roast', () => {
      mockDb.seed('roastBatch', { id: 'rb-1', roasterId: 'roaster-1', roasterInventoryId: 'inv-x', greenBeanLotId: 'gbl-2' })
    }, '1 roast batch'],
    ['a sale order line', () => {
      mockDb.seed('saleOrderItem', { id: 'soi-1', greenBeanLotId: 'gbl-2' })
    }, '1 sale order line'],
    ['an invoice line', () => {
      mockDb.seed('invoiceItem', { id: 'ii-1', greenBeanLotId: 'gbl-2' })
    }, '1 invoice line'],
    ['a cupping sample', () => {
      mockDb.seed('cuppingSample', { id: 'cs-1', greenBeanLotId: 'gbl-2' })
    }, '1 cupping sample'],
  ]

  test.each(uses)('409 for %s, listing the lot, and nothing is deleted', async (_label, use, words) => {
    use()
    const rowsBefore = {
      greenBeanLot: mockDb.rows('greenBeanLot').length,
      roasterInventoryItem: mockDb.rows('roasterInventoryItem').length,
    }

    const { status, body } = await del()

    expect(status).toBe(409)
    expect(body.error).toBe(
      `Green bean lots made from this lot are still in use, so nothing was deleted: GBL-2 (A) has ${words}. ` +
        'Void their withdrawals, or settle their stock, roasts, sales and cupping first, then delete again.',
    )
    expect(body.greenBeanLotsInUse).toEqual([
      { id: 'gbl-2', displayId: 'GBL-2', grade: 'A', dependents: expect.any(Object) },
    ])
    // No dependents key: the Data Hub shows the message rather than the counts popup.
    expect(body.dependents).toBeUndefined()
    expect(mockDb.get('harvestLot', HARVEST)).toBeDefined()
    expect(mockDb.rows('greenBeanLot')).toHaveLength(rowsBefore.greenBeanLot)
    expect(mockDb.rows('roasterInventoryItem')).toHaveLength(rowsBefore.roasterInventoryItem)
  })

  test('every used lot is listed', async () => {
    mockDb.seed('greenBeanWithdrawal', { id: 'gbw-1', greenBeanLotId: 'gbl-1', amountKg: 5, withdrawalType: 'Sale', voidedAt: null })
    mockDb.seed('greenBeanWithdrawal', { id: 'gbw-2', greenBeanLotId: 'gbl-1', amountKg: 5, withdrawalType: 'Sale', voidedAt: null })
    mockDb.seed('roastBatch', { id: 'rb-1', roasterId: 'roaster-1', roasterInventoryId: 'inv-x', greenBeanLotId: 'gbl-3' })

    const { status, body } = await del()

    expect(status).toBe(409)
    expect(body.error).toContain('GBL-1 (AA) has 2 withdrawals; GBL-3 (AA) has 1 roast batch.')
    expect(body.greenBeanLotsInUse.map((lot: any) => lot.id)).toEqual(['gbl-1', 'gbl-3'])
    expect(greenIds()).toHaveLength(4)
  })

  test('the empty roaster stock row of an unused lot stays when the cascade is refused', async () => {
    mockDb.seed('roasterInventoryItem', { id: 'inv-empty', roasterId: 'roaster-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 0, remainingWeightKg: 0 })
    mockDb.seed('invoiceItem', { id: 'ii-1', greenBeanLotId: 'gbl-3' })

    expect((await del()).status).toBe(409)
    expect(mockDb.get('roasterInventoryItem', 'inv-empty')).toBeDefined()
  })

  test('the owner farmer still cannot cascade (403)', async () => {
    mockAuthUser = farmer
    const { status } = await del()
    expect(status).toBe(403)
    expect(greenIds()).toHaveLength(4)
    expect(mockDb.get('harvestLot', HARVEST)).toBeDefined()
  })
})
