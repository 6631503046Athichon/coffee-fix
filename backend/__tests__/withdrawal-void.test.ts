/**
 * D7 / F24: a wrong withdrawal is voided, not deleted.
 * POST /api/green-bean-lots/[id]/withdrawals/[withdrawalId]/void and
 * POST /api/parchment-lots/[id]/withdrawals/[withdrawalId]/void put the kg
 * back on the lot in one transaction (and take them back off the roaster's
 * stock a green-bean push filled, or remove the green bean lots a Hull &
 * Grade made) and keep the row, marked void.
 *
 * These run against an in-memory database (helpers/memoryPrisma), so they
 * check the stock that results, not the calls. Withdrawals are recorded
 * through the real POST routes where it matters, so the roaster and hull
 * links those routes now save are covered too.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemoryPrisma } from './helpers/memoryPrisma'
import { publicWithdrawal, greenBeanLotForViewer } from '@/lib/withdrawalPrivacy'

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
  // Same bodies as lib/middleware's handleApiError for what these routes throw.
  handleApiError: jest.fn((error: any) => {
    const [status, message] =
      error.message === 'Unauthorized'
        ? [401, 'Unauthorized']
        : error.message === 'Insufficient permissions'
          ? [403, 'Forbidden']
          : error.code === 'P2025'
            ? [404, 'Record not found']
            : [500, error.message]
    return new Response(JSON.stringify({ error: message }), { status })
  }),
}))

const user = (id: string, name: string, roles: string[], isSuperAdmin = false) => ({
  id,
  name,
  roles,
  isActive: true,
  isSuperAdmin,
})

const processor = user('processor-1', 'Processor One', ['Processor'])
const otherProcessor = user('processor-2', 'Processor Two', ['Processor'])
const roaster = user('roaster-1', 'Roaster One', ['Roaster'])
const otherRoaster = user('roaster-2', 'Roaster Two', ['Roaster'])
const farmer = user('farmer-1', 'Farmer', ['Farmer'])
const admin = user('admin-1', 'Admin', ['Admin'])
const superAdmin = user('super-1', 'Super', [], true)

const GREEN = 'gbl-1'
const PARCHMENT = 'pl-1'

const json = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
})

async function recordGreen(body: Record<string, unknown>, lotId = GREEN) {
  const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')
  const response = await POST(
    new NextRequest(`http://localhost:3001/api/green-bean-lots/${lotId}/withdrawals`, {
      method: 'POST',
      ...json({ purpose: 'Test', ...body }),
    }),
    { params: Promise.resolve({ id: lotId }) },
  )
  expect(response.status).toBe(201)
  const rows = mockDb.rows('greenBeanWithdrawal')
  return rows[rows.length - 1]
}

async function recordParchment(body: Record<string, unknown>, lotId = PARCHMENT) {
  const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
  const response = await POST(
    new NextRequest(`http://localhost:3001/api/parchment-lots/${lotId}/withdrawals`, {
      method: 'POST',
      ...json({ purpose: 'Test', ...body }),
    }),
    { params: Promise.resolve({ id: lotId }) },
  )
  expect(response.status).toBe(201)
  const rows = mockDb.rows('parchmentWithdrawal')
  return rows[rows.length - 1]
}

// `body` undefined sends no body at all, as a client may for a void.
async function voidGreen(withdrawalId: string, body?: unknown, lotId = GREEN) {
  const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/[withdrawalId]/void/route')
  return POST(
    new NextRequest(`http://localhost:3001/api/green-bean-lots/${lotId}/withdrawals/${withdrawalId}/void`, {
      method: 'POST',
      ...(body !== undefined && json(body)),
    }),
    { params: Promise.resolve({ id: lotId, withdrawalId }) },
  )
}

async function voidParchment(withdrawalId: string, body?: unknown, lotId = PARCHMENT) {
  const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/[withdrawalId]/void/route')
  return POST(
    new NextRequest(`http://localhost:3001/api/parchment-lots/${lotId}/withdrawals/${withdrawalId}/void`, {
      method: 'POST',
      ...(body !== undefined && json(body)),
    }),
    { params: Promise.resolve({ id: lotId, withdrawalId }) },
  )
}

const greenLot = () => mockDb.get('greenBeanLot', GREEN)!
const parchmentLot = () => mockDb.get('parchmentLot', PARCHMENT)!
const stockRow = (roasterId: string) =>
  mockDb.rows('roasterInventoryItem').find(r => r.roasterId === roasterId && r.greenBeanLotId === GREEN)

function seedGreenLot(fields: Record<string, unknown> = {}) {
  return mockDb.seed('greenBeanLot', {
    id: GREEN,
    displayId: 'GBL-2026-1',
    sourceType: 'Internal',
    grade: 'AA',
    initialWeightKg: 100,
    currentWeightKg: 100,
    availabilityStatus: 'Available',
    createdById: 'processor-1',
    ...fields,
  })
}

// A withdrawal row as an older backend left it (or one set up directly).
function seedGreenWithdrawal(fields: Record<string, unknown>) {
  return mockDb.seed('greenBeanWithdrawal', {
    id: 'gbw-1',
    greenBeanLotId: GREEN,
    amountKg: 30,
    withdrawalType: 'Sale',
    purpose: 'Sale',
    withdrawnBy: 'processor-1',
    withdrawnByName: 'Processor One',
    targetRoasterId: null,
    voidedAt: null,
    date: new Date('2026-09-01T03:00:00.000Z'),
    ...fields,
  })
}

function seedStock(roasterId: string, claimedWeightKg: number, remainingWeightKg: number) {
  return mockDb.seed('roasterInventoryItem', {
    id: `inv-${roasterId}`,
    roasterId,
    greenBeanLotId: GREEN,
    claimedWeightKg,
    remainingWeightKg,
  })
}

function seedParchmentLot(fields: Record<string, unknown> = {}) {
  return mockDb.seed('parchmentLot', {
    id: PARCHMENT,
    displayId: 'PL-2026-1',
    processingBatchId: 'pb-1',
    sourceType: 'Internal',
    initialWeightKg: 50,
    currentWeightKg: 50,
    moistureContent: 11,
    processType: 'Washed',
    status: 'AwaitingHulling',
    ...fields,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.reset()
  mockAuthUser = null
  for (const u of [processor, otherProcessor, roaster, otherRoaster, farmer, admin, superAdmin]) {
    mockDb.seed('user', { ...u })
  }
  mockDb.seed('processingBatch', { id: 'pb-1', createdById: 'processor-1' })
})

describe('POST /api/green-bean-lots/[id]/withdrawals/[withdrawalId]/void', () => {
  beforeEach(() => {
    seedGreenLot()
  })

  test('voiding a Sale puts its kg back on the lot and keeps the row, marked void', async () => {
    mockAuthUser = processor
    const sale = await recordGreen({ amountKg: 30, withdrawalType: 'Sale', salePrice: 200, customerName: 'Cafe Doi' })
    expect(greenLot().currentWeightKg).toBe(70)

    const response = await voidGreen(sale.id, { reason: '  Wrong kg  ' })
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(greenLot().currentWeightKg).toBe(100)
    const row = mockDb.get('greenBeanWithdrawal', sale.id)!
    expect(row.voidedAt).toBeInstanceOf(Date)
    expect(row.voidedById).toBe('processor-1')
    expect(row.voidReason).toBe('Wrong kg')
    // The sale stays on the record.
    expect(row.amountKg).toBe(30)
    expect(row.customerName).toBe('Cafe Doi')
    expect(mockDb.rows('greenBeanWithdrawal')).toHaveLength(1)

    expect(body.withdrawal).toMatchObject({ id: sale.id, voidedById: 'processor-1', voidReason: 'Wrong kg' })
    expect(body.withdrawal.voidedAt).toBeTruthy()
    expect(body.greenBeanLot.currentWeightKg).toBe(100)
    expect(body.greenBeanLot.withdrawalHistory[0]).toMatchObject({ id: sale.id, voidReason: 'Wrong kg' })
    expect(body.roasterInventoryItem).toBeNull()
  })

  test('the lot is locked before anything is written', async () => {
    mockAuthUser = processor
    const sale = await recordGreen({ amountKg: 30, withdrawalType: 'Sale' })
    await voidGreen(sale.id)
    expect(mockDb.locks[0]).toContain('FROM "GreenBeanLot" WHERE "id" = ? FOR NO KEY UPDATE [gbl-1]')
  })

  test('a lot the withdrawal emptied is Available again', async () => {
    mockAuthUser = processor
    const sale = await recordGreen({ amountKg: 100, withdrawalType: 'Sale' })
    expect(greenLot()).toMatchObject({ currentWeightKg: 0, availabilityStatus: 'Withdrawn' })

    expect((await voidGreen(sale.id)).status).toBe(200)
    expect(greenLot()).toMatchObject({ currentWeightKg: 100, availabilityStatus: 'Available' })
  })

  test('a lot its owner took off the market while it held kg stays withdrawn', async () => {
    greenLot().currentWeightKg = 70
    greenLot().availabilityStatus = 'Withdrawn'
    seedGreenWithdrawal({ amountKg: 30 })
    mockAuthUser = processor

    expect((await voidGreen('gbw-1')).status).toBe(200)
    expect(greenLot()).toMatchObject({ currentWeightKg: 100, availabilityStatus: 'Withdrawn' })
  })

  test('no body, or no reason, is a void without a reason', async () => {
    seedGreenWithdrawal({ id: 'gbw-1' })
    seedGreenWithdrawal({ id: 'gbw-2' })
    greenLot().currentWeightKg = 40
    mockAuthUser = processor

    expect((await voidGreen('gbw-1')).status).toBe(200)
    expect((await voidGreen('gbw-2', {})).status).toBe(200)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidReason).toBeNull()
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-2')!.voidReason).toBeNull()
    expect(greenLot().currentWeightKg).toBe(100)
  })

  test.each([
    ['a reason that is not text', { reason: 42 }],
    ['a reason over 500 characters', { reason: 'x'.repeat(501) }],
    ['other keys', { reason: 'Wrong', amountKg: 10 }],
    ['a body that is not an object', ['Wrong']],
  ])('400 for %s, and nothing changes', async (_label, body) => {
    seedGreenWithdrawal({})
    greenLot().currentWeightKg = 70
    mockAuthUser = processor

    expect((await voidGreen('gbw-1', body)).status).toBe(400)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
    expect(greenLot().currentWeightKg).toBe(70)
  })

  describe('Roasting Stock pushed to a roaster', () => {
    test('the withdrawal records the roaster, and the void takes the kg back off their stock', async () => {
      mockAuthUser = processor
      const push = await recordGreen({ amountKg: 40, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      expect(push.targetRoasterId).toBe('roaster-1')
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 40, remainingWeightKg: 40 })
      expect(greenLot().currentWeightKg).toBe(60)

      const response = await voidGreen(push.id)
      expect(response.status).toBe(200)
      const body = await response.json()

      expect(greenLot().currentWeightKg).toBe(100)
      // The push made the row and the void took it all back: nothing points
      // at it, so it goes (left at 0 kg it kept the lot from being deleted).
      expect(stockRow('roaster-1')).toBeUndefined()
      expect(body.roasterInventoryItem).toMatchObject({ roasterId: 'roaster-1', claimedWeightKg: 0, remainingWeightKg: 0 })
      expect(body.roasterInventoryItemRemoved).toBe(true)
      expect(mockDb.get('greenBeanWithdrawal', push.id)!.voidedAt).toBeInstanceOf(Date)
      // Lot, then the stock row.
      expect(mockDb.locks.map(lock => lock.split(' WHERE')[0])).toEqual([
        'SELECT "id" FROM "GreenBeanLot"',
        'SELECT "id" FROM "RoasterInventoryItem"',
      ])
    })

    test("only the withdrawal's kg leave a stock row that also holds the roaster's own claim", async () => {
      // Claimed 10 themselves (4 roasted), then the 5 kg push: 15 claimed, 11 on the shelf.
      seedStock('roaster-1', 15, 11)
      seedGreenWithdrawal({ amountKg: 5, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      greenLot().currentWeightKg = 85
      mockAuthUser = processor

      const response = await voidGreen('gbw-1')
      expect(response.status).toBe(200)
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 10, remainingWeightKg: 6 })
      expect((await response.json()).roasterInventoryItemRemoved).toBe(false)
      expect(greenLot().currentWeightKg).toBe(90)
    })

    test.each([
      ['a roast', () => mockDb.seed('roastBatch', { id: 'rb-1', roasterId: 'roaster-1', roasterInventoryId: 'inv-roaster-1', greenBeanLotId: GREEN })],
      ['a green-bean sale line', () => mockDb.seed('saleOrderItem', { id: 'soi-1', roasterInventoryId: 'inv-roaster-1', greenBeanLotId: GREEN })],
    ])('a stock row left at 0 kg stays when %s points at it', async (_label, pointAtRow) => {
      seedStock('roaster-1', 20, 20)
      pointAtRow()
      seedGreenWithdrawal({ amountKg: 20, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      greenLot().currentWeightKg = 80
      mockAuthUser = processor

      const response = await voidGreen('gbw-1')
      expect(response.status).toBe(200)
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 0, remainingWeightKg: 0 })
      expect((await response.json()).roasterInventoryItemRemoved).toBe(false)
      expect(greenLot().currentWeightKg).toBe(100)
    })

    test('a void the lot refuses keeps the stock row as it was', async () => {
      // The lot was corrected by hand to its full weight: the kg cannot go back.
      seedStock('roaster-1', 20, 20)
      seedGreenWithdrawal({ amountKg: 20, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      mockAuthUser = processor

      expect((await voidGreen('gbw-1')).status).toBe(409)
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 20, remainingWeightKg: 20 })
    })

    test('after the void an Admin can delete a lot that was only ever pushed to a roaster', async () => {
      mockAuthUser = processor
      const push = await recordGreen({ amountKg: 40, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      expect((await voidGreen(push.id)).status).toBe(200)

      mockAuthUser = admin
      const { DELETE } = await import('@/app/api/green-bean-lots/[id]/route')
      const response = await DELETE(
        new NextRequest(`http://localhost:3001/api/green-bean-lots/${GREEN}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: GREEN }) },
      )
      expect(response.status).toBe(200)
      expect(mockDb.get('greenBeanLot', GREEN)).toBeUndefined()
      expect(mockDb.rows('greenBeanWithdrawal')).toEqual([])
      expect(mockDb.rows('roasterInventoryItem')).toEqual([])
    })

    test('409 when the roaster already used the kg, and nothing changes', async () => {
      // 40 kg pushed, 15 of them already roasted or sold.
      seedStock('roaster-1', 40, 25)
      seedGreenWithdrawal({ amountKg: 40, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      greenLot().currentWeightKg = 60
      mockAuthUser = processor

      const response = await voidGreen('gbw-1', { reason: 'Wrong roaster' })
      expect(response.status).toBe(409)
      const { error } = await response.json()
      expect(error).toContain('Roaster One already used these kg')
      expect(error).toContain('only 25 of the 40 kg')

      expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')).toMatchObject({ voidedAt: null })
      expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidReason).toBeUndefined()
      expect(greenLot().currentWeightKg).toBe(60)
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 40, remainingWeightKg: 25 })
    })

    test("409 when the roaster's stock row is gone", async () => {
      seedGreenWithdrawal({ amountKg: 40, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })
      greenLot().currentWeightKg = 60
      mockAuthUser = processor

      const response = await voidGreen('gbw-1')
      expect(response.status).toBe(409)
      expect(greenLot().currentWeightKg).toBe(60)
      expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
    })

    test('an older Roasting Stock row with no roaster saved takes the kg from the one stock row of the lot', async () => {
      // Seeded together, as the push makes the row in the same transaction.
      seedStock('roaster-2', 20, 20)
      seedGreenWithdrawal({ amountKg: 20, withdrawalType: 'RoastingStock', targetRoasterId: null })
      greenLot().currentWeightKg = 80
      mockAuthUser = processor

      expect((await voidGreen('gbw-1')).status).toBe(200)
      // Taken back to 0 kg with nothing pointing at it: the row goes.
      expect(stockRow('roaster-2')).toBeUndefined()
      expect(greenLot().currentWeightKg).toBe(100)
    })

    test("409 for an older Roasting Stock row when the lot's one stock row was started after it", async () => {
      // The roaster pushed to was deleted (their stock row went with them),
      // then another roaster claimed 15 kg of the lot: that row never held the push.
      const pushedAt = new Date('2026-09-01T03:00:00.000Z')
      seedGreenWithdrawal({ amountKg: 10, withdrawalType: 'RoastingStock', targetRoasterId: null, createdAt: pushedAt })
      mockDb.seed('roasterInventoryItem', {
        id: 'inv-roaster-1',
        roasterId: 'roaster-1',
        greenBeanLotId: GREEN,
        claimedWeightKg: 15,
        remainingWeightKg: 15,
        createdAt: new Date('2026-09-20T03:00:00.000Z'),
      })
      greenLot().currentWeightKg = 75
      mockAuthUser = processor

      const response = await voidGreen('gbw-1')
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain('was started after it')
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 15, remainingWeightKg: 15 })
      expect(greenLot().currentWeightKg).toBe(75)
      expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
    })

    test.each([
      ['two roasters hold stock from the lot', 2, '2 roasters hold stock from this lot'],
      ['no roaster holds stock from the lot', 0, 'No roaster holds stock from this lot'],
    ])('409 for an older Roasting Stock row when %s', async (_label, rows, message) => {
      if (rows >= 1) seedStock('roaster-1', 20, 20)
      if (rows >= 2) seedStock('roaster-2', 20, 20)
      seedGreenWithdrawal({ amountKg: 20, withdrawalType: 'RoastingStock', targetRoasterId: null })
      greenLot().currentWeightKg = 60
      mockAuthUser = processor

      const response = await voidGreen('gbw-1')
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain(message)
      expect(greenLot().currentWeightKg).toBe(60)
      expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
    })

    test("a Sale with no roaster never touches a roaster's stock of the lot", async () => {
      seedStock('roaster-1', 20, 20)
      seedGreenWithdrawal({ amountKg: 30, withdrawalType: 'Sale' })
      greenLot().currentWeightKg = 50
      mockAuthUser = processor

      expect((await voidGreen('gbw-1')).status).toBe(200)
      expect(stockRow('roaster-1')).toMatchObject({ claimedWeightKg: 20, remainingWeightKg: 20 })
      expect(greenLot().currentWeightKg).toBe(80)
    })
  })

  test('409 for a second void, and the kg go back only once', async () => {
    mockAuthUser = processor
    const sale = await recordGreen({ amountKg: 30, withdrawalType: 'Sale' })

    expect((await voidGreen(sale.id)).status).toBe(200)
    const again = await voidGreen(sale.id)
    expect(again.status).toBe(409)
    expect((await again.json()).error).toBe('This withdrawal is already void.')
    expect(greenLot().currentWeightKg).toBe(100)
  })

  test('409 when another void lands between the check and the transaction', async () => {
    seedGreenWithdrawal({ amountKg: 30, voidedAt: new Date(), voidedById: 'admin-1' })
    greenLot().currentWeightKg = 100
    mockAuthUser = processor
    // The route's first read still sees the row as live.
    const read = mockDb.client.greenBeanWithdrawal.findUnique
    mockDb.client.greenBeanWithdrawal.findUnique = async (args: any) => ({ ...(await read(args)), voidedAt: null })
    try {
      const response = await voidGreen('gbw-1')
      expect(response.status).toBe(409)
    } finally {
      mockDb.client.greenBeanWithdrawal.findUnique = read
    }
    expect(greenLot().currentWeightKg).toBe(100)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedById).toBe('admin-1')
  })

  test('409 when the kg would lift the lot above its starting weight (already corrected by hand)', async () => {
    seedGreenWithdrawal({ amountKg: 30 })
    greenLot().currentWeightKg = 100
    mockAuthUser = processor

    const response = await voidGreen('gbw-1')
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('above its starting weight')
    expect(greenLot().currentWeightKg).toBe(100)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
  })

  test.each([
    ['another Processor', otherProcessor],
    ['a Roaster who does not own the lot', roaster],
    ['a Farmer', farmer],
  ])('403 for %s, and nothing changes', async (_label, who) => {
    seedGreenWithdrawal({ amountKg: 30 })
    greenLot().currentWeightKg = 70
    mockAuthUser = who

    expect((await voidGreen('gbw-1')).status).toBe(403)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
    expect(greenLot().currentWeightKg).toBe(70)
  })

  test('401 when not signed in', async () => {
    seedGreenWithdrawal({})
    expect((await voidGreen('gbw-1')).status).toBe(401)
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])("%s can void a withdrawal on anyone's lot", async (_label, who) => {
    seedGreenWithdrawal({ amountKg: 30 })
    greenLot().currentWeightKg = 70
    mockAuthUser = who

    expect((await voidGreen('gbw-1', { reason: 'Fix' })).status).toBe(200)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')).toMatchObject({ voidedById: who.id, voidReason: 'Fix' })
    expect(greenLot().currentWeightKg).toBe(100)
  })

  test('a Roaster may void on a lot they created', async () => {
    greenLot().createdById = 'roaster-1'
    seedGreenWithdrawal({ amountKg: 30 })
    greenLot().currentWeightKg = 70
    mockAuthUser = roaster

    expect((await voidGreen('gbw-1')).status).toBe(200)
  })

  test('404 for an unknown lot, an unknown withdrawal, or one of another lot', async () => {
    mockDb.seed('greenBeanLot', { id: 'gbl-2', createdById: 'processor-1', initialWeightKg: 10, currentWeightKg: 10 })
    seedGreenWithdrawal({ id: 'gbw-1', greenBeanLotId: 'gbl-2', amountKg: 5 })
    mockAuthUser = processor

    expect((await voidGreen('gbw-1', undefined, 'gbl-missing')).status).toBe(404)
    expect((await voidGreen('gbw-missing')).status).toBe(404)
    expect((await voidGreen('gbw-1')).status).toBe(404)
    expect(mockDb.get('greenBeanWithdrawal', 'gbw-1')!.voidedAt).toBeNull()
  })
})

describe('POST /api/parchment-lots/[id]/withdrawals/[withdrawalId]/void', () => {
  beforeEach(() => {
    seedParchmentLot()
  })

  const hullAndGrade = {
    amountKg: 50,
    withdrawalType: 'HullAndGrade',
    totalGreenBeanWeight: 38,
    gradedLots: [
      { grade: 'AA', weight: 20, price: 220 },
      { grade: 'A', weight: 18 },
    ],
  }

  const gradedLots = (withdrawalId: string) =>
    mockDb.rows('greenBeanLot').filter(r => r.parchmentWithdrawalId === withdrawalId)

  test('voiding a Sale puts its kg back and an emptied lot is awaiting hulling again', async () => {
    mockAuthUser = processor
    const sale = await recordParchment({ amountKg: 50, withdrawalType: 'Sale', salePrice: 120 })
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 0, status: 'Hulled' })

    const response = await voidParchment(sale.id, { reason: 'Never shipped' })
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
    expect(mockDb.get('parchmentWithdrawal', sale.id)).toMatchObject({
      voidedById: 'processor-1',
      voidReason: 'Never shipped',
      amountKg: 50,
    })
    expect(body.parchmentLot.withdrawalHistory[0].voidedAt).toBeTruthy()
    expect(body.removedGreenBeanLots).toEqual([])
  })

  test('a lot marked Hulled by hand while it held kg keeps its status', async () => {
    parchmentLot().currentWeightKg = 30
    parchmentLot().status = 'Hulled'
    mockDb.seed('parchmentWithdrawal', { id: 'pw-1', parchmentLotId: PARCHMENT, amountKg: 20, withdrawalType: 'Sale', voidedAt: null })
    mockAuthUser = processor

    expect((await voidParchment('pw-1')).status).toBe(200)
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'Hulled' })
  })

  test('voiding Roasting Stock only puts the kg back (no roaster stock row holds parchment)', async () => {
    mockAuthUser = processor
    const push = await recordParchment({ amountKg: 10, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' })

    expect((await voidParchment(push.id)).status).toBe(200)
    expect(parchmentLot().currentWeightKg).toBe(50)
    expect(mockDb.rows('roasterInventoryItem')).toEqual([])
  })

  test('a Hull & Grade links the lots it makes, and voiding it removes them and puts the parchment back', async () => {
    mockAuthUser = processor
    const hull = await recordParchment(hullAndGrade)
    const made = gradedLots(hull.id)
    expect(made.map(lot => lot.grade).sort()).toEqual(['A', 'AA'])
    expect(mockDb.rows('pricingHistory')).toHaveLength(1)
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 0, status: 'Hulled' })

    const response = await voidParchment(hull.id, { reason: 'Graded the wrong lot' })
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(mockDb.rows('greenBeanLot')).toEqual([])
    expect(mockDb.rows('pricingHistory')).toEqual([])
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
    expect(mockDb.get('parchmentWithdrawal', hull.id)!.voidReason).toBe('Graded the wrong lot')
    expect(body.removedGreenBeanLots.map((lot: any) => lot.id).sort()).toEqual(made.map(lot => lot.id).sort())
    // The green lots are locked FOR UPDATE before they are checked and removed.
    expect(mockDb.locks[1]).toContain('FROM "GreenBeanLot" WHERE "id" IN (?,?) ORDER BY "id" FOR UPDATE')
  })

  test("another hull's lots of the same parchment are left alone", async () => {
    mockAuthUser = processor
    const first = await recordParchment({ ...hullAndGrade, amountKg: 20, totalGreenBeanWeight: 16, gradedLots: [{ grade: 'AA', weight: 16 }] })
    const second = await recordParchment({ ...hullAndGrade, amountKg: 30, totalGreenBeanWeight: 24, gradedLots: [{ grade: 'A', weight: 24 }] })

    expect((await voidParchment(second.id)).status).toBe(200)
    expect(mockDb.rows('greenBeanLot').map(lot => lot.parchmentWithdrawalId)).toEqual([first.id])
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 30, status: 'AwaitingHulling' })
  })

  const uses: [string, (lotId: string) => void, string][] = [
    ['has a withdrawal', lotId => { mockDb.seed('greenBeanWithdrawal', { id: 'gbw-x', greenBeanLotId: lotId, amountKg: 0.5, voidedAt: null }) }, 'has withdrawals'],
    ['was claimed by a roaster', lotId => { mockDb.seed('roasterInventoryItem', { id: 'inv-x', roasterId: 'roaster-1', greenBeanLotId: lotId, claimedWeightKg: 5, remainingWeightKg: 5 }) }, 'was claimed by a roaster'],
    ['has an empty roaster stock row that was roasted from', lotId => {
      mockDb.seed('roasterInventoryItem', { id: 'inv-x', roasterId: 'roaster-1', greenBeanLotId: lotId, claimedWeightKg: 0, remainingWeightKg: 0 })
      mockDb.seed('roastBatch', { id: 'rb-x', roasterInventoryId: 'inv-x' })
    }, 'was claimed by a roaster'],
    ['was roasted', lotId => { mockDb.seed('roastBatch', { id: 'rb-x', greenBeanLotId: lotId }) }, 'was roasted'],
    ['is on a sale', lotId => { mockDb.seed('saleOrderItem', { id: 'soi-x', greenBeanLotId: lotId }) }, 'is on a sale or invoice'],
    ['is on an invoice', lotId => { mockDb.seed('invoiceItem', { id: 'ii-x', greenBeanLotId: lotId }) }, 'is on a sale or invoice'],
    ['is a cupping sample', lotId => { mockDb.seed('cuppingSample', { id: 'cs-x', greenBeanLotId: lotId }) }, 'was cupped'],
    ['has a cupping score', lotId => { mockDb.seed('cuppingScore', { id: 'csc-x', greenBeanLotId: lotId }) }, 'was cupped'],
    ['has scores on the lot', lotId => { mockDb.get('greenBeanLot', lotId)!.cuppingOverall = 7.5 }, 'was cupped'],
    ['lost weight', lotId => { mockDb.get('greenBeanLot', lotId)!.currentWeightKg = 19 }, 'holds 19 of its 20 kg'],
    ['was taken off the market', lotId => { mockDb.get('greenBeanLot', lotId)!.availabilityStatus = 'Withdrawn' }, 'was taken off the market'],
    ['has a public trace QR', lotId => { mockDb.get('greenBeanLot', lotId)!.publicTraceId = 'TRACE-1' }, 'has a public trace QR'],
  ]

  test.each(uses)('409 when a lot the hull made %s, and nothing changes', async (_label, use, reason) => {
    mockAuthUser = processor
    const hull = await recordParchment(hullAndGrade)
    const aa = gradedLots(hull.id).find(lot => lot.grade === 'AA')!
    use(aa.id)

    const response = await voidParchment(hull.id)
    expect(response.status).toBe(409)
    const { error } = await response.json()
    expect(error).toContain('cannot be voided because green bean lots it made were already used')
    expect(error).toContain(`${aa.displayId} (AA) ${reason}`)

    expect(gradedLots(hull.id)).toHaveLength(2)
    expect(mockDb.rows('pricingHistory')).toHaveLength(1)
    // The POST route leaves voidedAt to the column's NULL.
    expect(mockDb.get('parchmentWithdrawal', hull.id)!.voidedAt ?? null).toBeNull()
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 0, status: 'Hulled' })
  })

  test('an empty roaster stock row (claim released to 0, no roast or sale) goes with the lot', async () => {
    mockAuthUser = processor
    const hull = await recordParchment(hullAndGrade)
    const aa = gradedLots(hull.id).find(lot => lot.grade === 'AA')!
    mockDb.seed('roasterInventoryItem', { id: 'inv-empty', roasterId: 'roaster-1', greenBeanLotId: aa.id, claimedWeightKg: 0, remainingWeightKg: 0 })

    const response = await voidParchment(hull.id)
    expect(response.status).toBe(200)
    expect(mockDb.rows('greenBeanLot')).toEqual([])
    expect(mockDb.rows('roasterInventoryItem')).toEqual([])
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
  })

  test('a voided withdrawal on a lot the hull made is history: the lot goes, with it', async () => {
    mockAuthUser = processor
    const hull = await recordParchment(hullAndGrade)
    const aa = gradedLots(hull.id).find(lot => lot.grade === 'AA')!
    const sale = await recordGreen({ amountKg: 5, withdrawalType: 'Sale' }, aa.id)
    expect((await voidGreen(sale.id, undefined, aa.id)).status).toBe(200)

    const response = await voidParchment(hull.id)
    expect(response.status).toBe(200)
    expect(mockDb.rows('greenBeanLot')).toEqual([])
    expect(mockDb.rows('greenBeanWithdrawal')).toEqual([])
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
  })

  test('a lot the hull made and pushed to a roaster: void the push, then the hull', async () => {
    mockAuthUser = processor
    const hull = await recordParchment(hullAndGrade)
    const aa = gradedLots(hull.id).find(lot => lot.grade === 'AA')!
    const push = await recordGreen({ amountKg: 20, withdrawalType: 'RoastingStock', targetRoasterId: 'roaster-1' }, aa.id)

    // The roaster still holds the kg: the hull cannot be voided.
    const refused = await voidParchment(hull.id)
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toContain('has withdrawals, was claimed by a roaster')

    expect((await voidGreen(push.id, undefined, aa.id)).status).toBe(200)
    expect(mockDb.rows('roasterInventoryItem')).toEqual([])

    mockAuthUser = admin
    expect((await voidParchment(hull.id)).status).toBe(200)
    expect(mockDb.rows('greenBeanLot')).toEqual([])
    expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
  })

  describe('a Hull & Grade recorded before its lots were linked', () => {
    const HULLED_AT = new Date('2026-09-10T04:00:00.000Z')
    const at = (ms: number) => new Date(HULLED_AT.getTime() + ms)

    beforeEach(() => {
      parchmentLot().currentWeightKg = 0
      parchmentLot().status = 'Hulled'
      mockDb.seed('parchmentWithdrawal', {
        id: 'pw-old',
        parchmentLotId: PARCHMENT,
        amountKg: 50,
        withdrawalType: 'HullAndGrade',
        voidedAt: null,
        createdAt: HULLED_AT,
      })
    })

    const seedLegacyLot = (id: string, createdAt: Date, initialWeightKg = 19) =>
      mockDb.seed('greenBeanLot', {
        id,
        displayId: id.toUpperCase(),
        sourceType: 'Internal',
        parchmentLotId: PARCHMENT,
        parchmentWithdrawalId: null,
        grade: 'AA',
        initialWeightKg,
        currentWeightKg: initialWeightKg,
        availabilityStatus: 'Available',
        createdById: 'processor-1',
        createdAt,
      })

    test('removes the lots made with it, and leaves lots made at another time', async () => {
      seedLegacyLot('gbl-a', at(200))
      seedLegacyLot('gbl-b', at(300))
      seedLegacyLot('gbl-later', at(24 * 60 * 60 * 1000), 5)
      mockAuthUser = processor

      expect((await voidParchment('pw-old')).status).toBe(200)
      expect(mockDb.rows('greenBeanLot').map(lot => lot.id)).toEqual(['gbl-later'])
      expect(parchmentLot()).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
    })

    test.each([
      ['another Hull & Grade was recorded at the same time', () => {
        seedLegacyLot('gbl-a', at(200))
        mockDb.seed('parchmentWithdrawal', { id: 'pw-twin', parchmentLotId: PARCHMENT, amountKg: 10, withdrawalType: 'HullAndGrade', createdAt: at(20_000) })
      }, 'cannot be told apart'],
      ['the lots weigh more than the hull allowed', () => {
        seedLegacyLot('gbl-a', at(200), 40)
        seedLegacyLot('gbl-b', at(300), 40)
      }, 'cannot be told apart'],
      ['its lots are gone', () => {}, 'are gone'],
    ])('409 when %s, and nothing changes', async (_label, setUp, message) => {
      setUp()
      const lotsBefore = mockDb.rows('greenBeanLot').length
      mockAuthUser = processor

      const response = await voidParchment('pw-old')
      expect(response.status).toBe(409)
      expect((await response.json()).error).toContain(message)
      expect(mockDb.rows('greenBeanLot')).toHaveLength(lotsBefore)
      expect(mockDb.get('parchmentWithdrawal', 'pw-old')!.voidedAt).toBeNull()
      expect(parchmentLot().currentWeightKg).toBe(0)
    })
  })

  test('409 for a second void', async () => {
    mockAuthUser = processor
    const sale = await recordParchment({ amountKg: 10, withdrawalType: 'Sale' })
    expect((await voidParchment(sale.id)).status).toBe(200)
    expect((await voidParchment(sale.id)).status).toBe(409)
    expect(parchmentLot().currentWeightKg).toBe(50)
  })

  test.each([
    ['another Processor', otherProcessor],
    ['a Roaster', roaster],
  ])('403 for %s, and nothing changes', async (_label, who) => {
    mockDb.seed('parchmentWithdrawal', { id: 'pw-1', parchmentLotId: PARCHMENT, amountKg: 10, withdrawalType: 'Sale', voidedAt: null })
    parchmentLot().currentWeightKg = 40
    mockAuthUser = who

    expect((await voidParchment('pw-1')).status).toBe(403)
    expect(mockDb.get('parchmentWithdrawal', 'pw-1')!.voidedAt).toBeNull()
    expect(parchmentLot().currentWeightKg).toBe(40)
  })

  test('a lot with no batch (Excel import) is voided by an Admin only', async () => {
    parchmentLot().processingBatchId = null
    parchmentLot().currentWeightKg = 40
    mockDb.seed('parchmentWithdrawal', { id: 'pw-1', parchmentLotId: PARCHMENT, amountKg: 10, withdrawalType: 'Sale', voidedAt: null })

    mockAuthUser = processor
    expect((await voidParchment('pw-1')).status).toBe(403)
    mockAuthUser = admin
    expect((await voidParchment('pw-1')).status).toBe(200)
    expect(parchmentLot().currentWeightKg).toBe(50)
    expect(mockDb.get('parchmentWithdrawal', 'pw-1')!.voidedById).toBe('admin-1')
  })

  test('404 for a withdrawal of another lot', async () => {
    seedParchmentLot({ id: 'pl-2' })
    mockDb.seed('parchmentWithdrawal', { id: 'pw-1', parchmentLotId: 'pl-2', amountKg: 10, withdrawalType: 'Sale', voidedAt: null })
    mockAuthUser = processor

    expect((await voidParchment('pw-1')).status).toBe(404)
    expect((await voidParchment('pw-missing')).status).toBe(404)
  })
})

describe('who sees that a withdrawal is void', () => {
  const voided = {
    id: 'gbw-1',
    greenBeanLotId: GREEN,
    withdrawalType: 'Sale',
    amountKg: 30,
    purpose: 'Order 55 for Cafe Doi',
    customerName: 'Cafe Doi',
    salePrice: 200,
    totalAmount: 6000,
    invoiceNumber: 'INV-9',
    targetRoasterId: null,
    voidedAt: new Date('2026-10-01T00:00:00.000Z'),
    voidedById: 'processor-1',
    voidReason: 'Cafe Doi cancelled',
  }

  test('everyone sees the void flag; the reason stays private with the sale', () => {
    const shown = publicWithdrawal(voided)
    expect(shown).toMatchObject({ id: 'gbw-1', voidedAt: voided.voidedAt, voidedById: 'processor-1', saleDetailsHidden: true })
    for (const hidden of ['voidReason', 'purpose', 'customerName', 'salePrice', 'totalAmount', 'invoiceNumber', 'targetRoasterId']) {
      expect(shown).not.toHaveProperty(hidden)
    }
  })

  test("the lot's owner sees the whole void row", () => {
    const lot = { id: GREEN, createdById: 'processor-1', withdrawalHistory: [voided] }
    expect(greenBeanLotForViewer(processor as any, lot).withdrawalHistory).toEqual([voided])
    expect(greenBeanLotForViewer(otherProcessor as any, lot).withdrawalHistory[0]).not.toHaveProperty('voidReason')
  })
})

async function patchGreen(withdrawalId: string, body: unknown, lotId = GREEN) {
  const { PATCH } = await import('@/app/api/green-bean-lots/[id]/withdrawals/[withdrawalId]/route')
  return PATCH(
    new NextRequest(`http://localhost:3001/api/green-bean-lots/${lotId}/withdrawals/${withdrawalId}`, {
      method: 'PATCH',
      ...json(body),
    }),
    { params: Promise.resolve({ id: lotId, withdrawalId }) },
  )
}

async function patchParchment(withdrawalId: string, body: unknown, lotId = PARCHMENT) {
  const { PATCH } = await import('@/app/api/parchment-lots/[id]/withdrawals/[withdrawalId]/route')
  return PATCH(
    new NextRequest(`http://localhost:3001/api/parchment-lots/${lotId}/withdrawals/${withdrawalId}`, {
      method: 'PATCH',
      ...json(body),
    }),
    { params: Promise.resolve({ id: lotId, withdrawalId }) },
  )
}

describe('PATCH /api/green-bean-lots/[id]/withdrawals/[withdrawalId]', () => {
  beforeEach(() => {
    seedGreenLot({ currentWeightKg: 70 })
    seedGreenWithdrawal({
      amountKg: 30,
      salePrice: 200,
      currency: 'THB',
      totalAmount: 6000,
      customerName: 'Cafe Doi',
      deliveryAddress: 'Chiang Mai',
      invoiceNumber: 'INV-1',
    })
  })

  const row = () => mockDb.get('greenBeanWithdrawal', 'gbw-1')!

  test('edits the sale paperwork in place and works the total out from the new price', async () => {
    mockAuthUser = processor
    const response = await patchGreen('gbw-1', {
      customerName: '  Cafe Nan  ',
      deliveryAddress: 'Nan',
      salePrice: 215.5,
      currency: 'usd',
      invoiceNumber: 'INV-2',
    })
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(row()).toMatchObject({
      customerName: 'Cafe Nan',
      deliveryAddress: 'Nan',
      salePrice: 215.5,
      currency: 'USD',
      invoiceNumber: 'INV-2',
      totalAmount: 6465,
      // The stock it moved is not touched.
      amountKg: 30,
      withdrawalType: 'Sale',
    })
    expect(body.withdrawal).toMatchObject({ id: 'gbw-1', totalAmount: 6465, customerName: 'Cafe Nan' })
    expect(greenLot().currentWeightKg).toBe(70)
  })

  test('the total is rounded to the satang', async () => {
    row().amountKg = 12.345
    mockAuthUser = processor
    expect((await patchGreen('gbw-1', { salePrice: 99.99 })).status).toBe(200)
    expect(row().totalAmount).toBe(1234.38)
  })

  test('only the named fields change; the others keep their values', async () => {
    mockAuthUser = processor
    expect((await patchGreen('gbw-1', { invoiceNumber: 'INV-9' })).status).toBe(200)
    expect(row()).toMatchObject({ invoiceNumber: 'INV-9', customerName: 'Cafe Doi', salePrice: 200, totalAmount: 6000 })
  })

  test('null or an empty string clears a field, and a cleared price clears the total', async () => {
    mockAuthUser = processor
    expect((await patchGreen('gbw-1', { salePrice: null, deliveryAddress: '', invoiceNumber: null })).status).toBe(200)
    expect(row()).toMatchObject({ salePrice: null, totalAmount: null, deliveryAddress: null, invoiceNumber: null })
  })

  test('touches the lot, so pages showing it reload', async () => {
    const before = new Date('2026-01-01T00:00:00.000Z')
    greenLot().updatedAt = before
    mockAuthUser = processor
    expect((await patchGreen('gbw-1', { customerName: 'Cafe Nan' })).status).toBe(200)
    expect(greenLot().updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  test.each([
    ['amountKg', { amountKg: 10 }],
    ['withdrawalType', { withdrawalType: 'Sample' }],
    ['targetRoasterId', { targetRoasterId: 'roaster-1' }],
    ['a client total', { salePrice: 100, totalAmount: 1 }],
    ['purpose', { purpose: 'Changed' }],
    ['voidedAt', { voidedAt: null }],
    ['greenBeanLotId', { greenBeanLotId: 'gbl-2' }],
  ])('400 for %s, and nothing changes', async (_label, body) => {
    mockAuthUser = processor
    const response = await patchGreen('gbw-1', body)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('void it and record it again')
    expect(row()).toMatchObject({ amountKg: 30, withdrawalType: 'Sale', salePrice: 200, totalAmount: 6000 })
  })

  test.each([
    ['a price of 0', { salePrice: 0 }, 'greater than 0'],
    ['a negative price', { salePrice: -5 }, 'greater than 0'],
    ['a price with 3 decimals', { salePrice: 10.555 }, 'at most 2 decimals'],
    ['a price that is not a number', { salePrice: '150abc' }, 'greater than 0'],
    ['a price that is true', { salePrice: true }, 'greater than 0'],
    ['an unknown currency', { currency: 'BTC' }, 'Currency must be one of'],
    ['a customer name that is not text', { customerName: 5 }, 'customerName must be text'],
    ['a customer name over 200 characters', { customerName: 'x'.repeat(201) }, 'at most 200'],
    ['an invoice number over 50 characters', { invoiceNumber: 'x'.repeat(51) }, 'at most 50'],
    ['an empty body', {}, 'Nothing to change'],
    ['a body that is not an object', ['INV-2'], 'JSON object'],
  ])('400 for %s', async (_label, body, message) => {
    mockAuthUser = processor
    const response = await patchGreen('gbw-1', body)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain(message)
    expect(row()).toMatchObject({ salePrice: 200, totalAmount: 6000, currency: 'THB', customerName: 'Cafe Doi' })
  })

  test('a customer name of up to 200 characters, as the address book allows, is accepted', async () => {
    mockAuthUser = processor
    const name = 'C'.repeat(150)
    expect((await patchGreen('gbw-1', { customerName: name })).status).toBe(200)
    expect(row().customerName).toBe(name)
  })

  test('a price string with 2 decimals is accepted', async () => {
    mockAuthUser = processor
    expect((await patchGreen('gbw-1', { salePrice: '180.25' })).status).toBe(200)
    expect(row()).toMatchObject({ salePrice: 180.25, totalAmount: 5407.5 })
  })

  test('400 for a price or currency on a withdrawal that is not a Sale; its paperwork is still editable', async () => {
    row().withdrawalType = 'Sample'
    row().salePrice = null
    row().totalAmount = null
    mockAuthUser = processor

    const priced = await patchGreen('gbw-1', { salePrice: 100 })
    expect(priced.status).toBe(400)
    expect((await priced.json()).error).toBe('Only a Sale has a price and currency')
    expect((await patchGreen('gbw-1', { currency: 'USD' })).status).toBe(400)
    expect(row()).toMatchObject({ salePrice: null, totalAmount: null })

    expect((await patchGreen('gbw-1', { customerName: 'QC lab' })).status).toBe(200)
    expect(row().customerName).toBe('QC lab')
  })

  test('409 for a void withdrawal, and nothing changes', async () => {
    row().voidedAt = new Date()
    mockAuthUser = processor
    const response = await patchGreen('gbw-1', { salePrice: 250 })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('A void withdrawal cannot be edited.')
    expect(row()).toMatchObject({ salePrice: 200, totalAmount: 6000 })
  })

  test('409 when a void lands between the check and the write', async () => {
    row().voidedAt = new Date()
    mockAuthUser = processor
    const read = mockDb.client.greenBeanWithdrawal.findUnique
    mockDb.client.greenBeanWithdrawal.findUnique = async (args: any) => ({ ...(await read(args)), voidedAt: null })
    try {
      expect((await patchGreen('gbw-1', { salePrice: 250 })).status).toBe(409)
    } finally {
      mockDb.client.greenBeanWithdrawal.findUnique = read
    }
    expect(row()).toMatchObject({ salePrice: 200, totalAmount: 6000 })
  })

  test.each([
    ['another Processor', otherProcessor],
    ['a Roaster who does not own the lot', roaster],
    ['a Farmer', farmer],
  ])('403 for %s, and nothing changes', async (_label, who) => {
    mockAuthUser = who
    expect((await patchGreen('gbw-1', { customerName: 'Someone else' })).status).toBe(403)
    expect(row().customerName).toBe('Cafe Doi')
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])("%s can edit a withdrawal on anyone's lot", async (_label, who) => {
    mockAuthUser = who
    expect((await patchGreen('gbw-1', { salePrice: 210 })).status).toBe(200)
    expect(row()).toMatchObject({ salePrice: 210, totalAmount: 6300 })
  })

  test('404 for an unknown lot, an unknown withdrawal, or one of another lot', async () => {
    mockDb.seed('greenBeanLot', { id: 'gbl-2', createdById: 'processor-1', initialWeightKg: 10, currentWeightKg: 10 })
    mockAuthUser = processor
    expect((await patchGreen('gbw-1', { customerName: 'X' }, 'gbl-missing')).status).toBe(404)
    expect((await patchGreen('gbw-missing', { customerName: 'X' })).status).toBe(404)
    expect((await patchGreen('gbw-1', { customerName: 'X' }, 'gbl-2')).status).toBe(404)
    expect(row().customerName).toBe('Cafe Doi')
  })
})

describe('PATCH /api/parchment-lots/[id]/withdrawals/[withdrawalId]', () => {
  beforeEach(() => {
    seedParchmentLot({ currentWeightKg: 40 })
    mockDb.seed('parchmentWithdrawal', {
      id: 'pw-1',
      parchmentLotId: PARCHMENT,
      amountKg: 10,
      withdrawalType: 'Sale',
      purpose: 'Sale',
      salePrice: 120,
      currency: 'THB',
      totalAmount: 1200,
      customerName: 'Mill A',
      voidedAt: null,
    })
  })

  const row = () => mockDb.get('parchmentWithdrawal', 'pw-1')!

  test('records an invoice number and a new price, and works the total out', async () => {
    mockAuthUser = processor
    const response = await patchParchment('pw-1', { invoiceNumber: 'PINV-7', salePrice: 125.25 })
    expect(response.status).toBe(200)
    expect(row()).toMatchObject({ invoiceNumber: 'PINV-7', salePrice: 125.25, totalAmount: 1252.5, amountKg: 10 })
    expect((await response.json()).withdrawal).toMatchObject({ id: 'pw-1', invoiceNumber: 'PINV-7' })
    expect(parchmentLot().currentWeightKg).toBe(40)
  })

  test.each([
    ['amountKg', { amountKg: 5 }],
    ['the roaster', { targetRoasterId: 'roaster-1' }],
    ['the cupping score', { cuppingScore: 85 }],
    ['the graded lots', { gradedLots: [] }],
  ])('400 for %s', async (_label, body) => {
    mockAuthUser = processor
    expect((await patchParchment('pw-1', body)).status).toBe(400)
    expect(row()).toMatchObject({ amountKg: 10, salePrice: 120, totalAmount: 1200 })
  })

  test('400 for a price on a Hull & Grade', async () => {
    row().withdrawalType = 'HullAndGrade'
    mockAuthUser = processor
    expect((await patchParchment('pw-1', { salePrice: 100 })).status).toBe(400)
  })

  test('409 for a void withdrawal', async () => {
    row().voidedAt = new Date()
    mockAuthUser = processor
    expect((await patchParchment('pw-1', { invoiceNumber: 'PINV-7' })).status).toBe(409)
    expect(row().invoiceNumber).toBeUndefined()
  })

  test.each([
    ['another Processor', otherProcessor],
    ['a Roaster', roaster],
  ])('403 for %s', async (_label, who) => {
    mockAuthUser = who
    expect((await patchParchment('pw-1', { customerName: 'Mill B' })).status).toBe(403)
    expect(row().customerName).toBe('Mill A')
  })

  test('a lot with no batch (Excel import) is edited by an Admin only', async () => {
    parchmentLot().processingBatchId = null
    mockAuthUser = processor
    expect((await patchParchment('pw-1', { customerName: 'Mill B' })).status).toBe(403)
    mockAuthUser = admin
    expect((await patchParchment('pw-1', { customerName: 'Mill B' })).status).toBe(200)
    expect(row().customerName).toBe('Mill B')
  })

  test('404 for a withdrawal of another lot', async () => {
    seedParchmentLot({ id: 'pl-2' })
    mockAuthUser = processor
    expect((await patchParchment('pw-1', { customerName: 'X' }, 'pl-2')).status).toBe(404)
  })
})
