/**
 * The Parchment page's one-step Process & Grade: POST /api/processing-batches
 * with `hullAndGrade` writes the batch, its parchment lot and a Hull & Grade
 * of the whole parchment into green bean lots in ONE transaction. It used to
 * be two calls (the batch, then a Hull & Grade withdrawal), and a failed
 * second call left the parchment un-graded with the cherry lot used up.
 *
 * These run against an in-memory database (helpers/memoryPrisma) whose
 * client can only read: every write must go through the transaction, and a
 * transaction that throws leaves the tables as they were.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemoryPrisma } from './helpers/memoryPrisma'
import { businessYear, todayDateOnly } from '@/lib/utils'

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
const roaster = user('roaster-1', 'Roaster One', ['Roaster'])

const CHERRY = 'hl-1'

const BATCH = {
  harvestLotId: CHERRY,
  status: 'Completed',
  processType: 'Honey',
  parchmentWeightKg: 50,
  moistureContent: 11,
}

const HULL = {
  totalGreenBeanWeight: 38,
  gradedLots: [
    { grade: 'Grade A', weight: 30, price: 220 },
    { grade: 'Grade B', weight: 8 },
  ],
}

async function postBatch(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/processing-batches/route')
  return POST(
    new NextRequest('http://localhost:3001/api/processing-batches', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  )
}

const harvestLot = () => mockDb.get('harvestLot', CHERRY)!

const expectNothingWritten = () => {
  expect(harvestLot()).toMatchObject({ status: 'ReadyForProcessing', remainingWeightKg: null })
  expect(mockDb.rows('processingBatch')).toEqual([])
  expect(mockDb.rows('parchmentLot')).toEqual([])
  expect(mockDb.rows('parchmentWithdrawal')).toEqual([])
  expect(mockDb.rows('greenBeanLot')).toEqual([])
  expect(mockDb.rows('pricingHistory')).toEqual([])
}

describe('POST /api/processing-batches with hullAndGrade (one-step Process & Grade)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDb.reset()
    mockDb.seed('harvestLot', {
      id: CHERRY,
      farmerName: 'Somchai',
      cherryVariety: 'Typica',
      weightKg: 120,
      remainingWeightKg: null,
      status: 'ReadyForProcessing',
    })
    mockAuthUser = processor
  })

  test('writes the batch, the hulled parchment, the Hull & Grade row and the graded lots together', async () => {
    const response = await postBatch({ ...BATCH, hullAndGrade: HULL })
    expect(response.status).toBe(201)
    const body = await response.json()
    const year = businessYear()

    expect(harvestLot()).toMatchObject({ status: 'Complete', remainingWeightKg: 0 })

    const [batch] = mockDb.rows('processingBatch')
    expect(batch).toMatchObject({ displayId: `PB-${year}-1`, status: 'Completed', createdById: 'processor-1' })

    const [parchment] = mockDb.rows('parchmentLot')
    expect(parchment).toMatchObject({
      displayId: `PCH-${year}-1`,
      processingBatchId: batch.id,
      initialWeightKg: 50,
      currentWeightKg: 0,
      status: 'Hulled',
    })

    const [hull] = mockDb.rows('parchmentWithdrawal')
    expect(hull).toMatchObject({
      parchmentLotId: parchment.id,
      amountKg: 50,
      withdrawalType: 'HullAndGrade',
      purpose: 'Hull and grade',
      withdrawnBy: 'processor-1',
      withdrawnByName: 'Processor One',
    })

    const lots = mockDb.rows('greenBeanLot')
    expect(lots.map(lot => lot.displayId)).toEqual([`GBL-${year}-1`, `GBL-${year}-2`])
    expect(lots[0]).toMatchObject({
      grade: 'Grade A',
      initialWeightKg: 30,
      currentWeightKg: 30,
      sourceType: 'Internal',
      availabilityStatus: 'Available',
      parchmentLotId: parchment.id,
      parchmentWithdrawalId: hull.id,
      createdById: 'processor-1',
      pricePerKg: 220,
      currency: 'THB',
      priceSetBy: 'processor-1',
    })
    expect(lots[0].priceSetDate).toEqual(todayDateOnly())
    expect(lots[1]).toMatchObject({ grade: 'Grade B', initialWeightKg: 8, parchmentWithdrawalId: hull.id })
    expect(lots[1].pricePerKg).toBeUndefined()
    // The price typed at grading gets its audit row, as in the two-step flow.
    expect(mockDb.rows('pricingHistory')).toEqual([
      expect.objectContaining({ greenBeanLotId: lots[0].id, pricePerKg: 220, setBy: 'processor-1' }),
    ])

    // Everything the client needs to show the result without a reload.
    expect(body.processingBatch).toMatchObject({ id: batch.id, displayId: `PB-${year}-1` })
    expect(body.parchmentLot).toMatchObject({ id: parchment.id, currentWeightKg: 0, status: 'Hulled' })
    expect(body.parchmentLot.withdrawalHistory).toHaveLength(1)
    expect(body.greenBeanLots.map((lot: any) => lot.grade)).toEqual(['Grade A', 'Grade B'])
    expect(body.greenBeanLots[0].pricePerKg).toBe(220)
  })

  test('a grading that fails inside the transaction leaves nothing behind and the cherry lot Ready', async () => {
    const realCreate = mockDb.tx.pricingHistory.create
    mockDb.tx.pricingHistory.create = async () => {
      throw new Error('database went away')
    }
    try {
      const response = await postBatch({ ...BATCH, hullAndGrade: HULL })
      expect(response.status).toBe(500)
    } finally {
      mockDb.tx.pricingHistory.create = realCreate
    }

    expectNothingWritten()

    // And the same Process & Grade then goes through.
    expect((await postBatch({ ...BATCH, hullAndGrade: HULL })).status).toBe(201)
    expect(mockDb.rows('greenBeanLot')).toHaveLength(2)
  })

  test.each([
    ['green beans outweigh the parchment', { gradedLots: [{ grade: 'Grade A', weight: 51 }] }, 'cannot exceed the parchment'],
    ['a grade is repeated', { gradedLots: [{ grade: 'Grade A', weight: 10 }, { grade: 'Grade A', weight: 5 }] }, 'Duplicate grade'],
    ['a row has no weight', { gradedLots: [{ grade: 'Grade A', weight: 0 }] }, 'weight greater than 0'],
    ['no grades are given', { gradedLots: [] }, 'Graded lots are required'],
    ['a price has 3 decimals', { gradedLots: [{ grade: 'Grade A', weight: 10, price: 220.555 }] }, 'at most 2 decimals'],
    ['the declared total does not match', { totalGreenBeanWeight: 20, gradedLots: [{ grade: 'Grade A', weight: 10 }] }, 'exactly match'],
    ['it is not an object', ['Grade A'], 'must be an object'],
  ])('400 before anything is written when %s', async (_why, hullAndGrade, message) => {
    const response = await postBatch({ ...BATCH, hullAndGrade })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain(message)
    expectNothingWritten()
    // No PB / PCH / GBL number was taken for it.
    expect(mockDb.sequences()).toEqual({})
  })

  test('400 for a batch that is not Completed: there is no parchment to grade', async () => {
    const response = await postBatch({ harvestLotId: CHERRY, processType: 'Honey', hullAndGrade: HULL })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/Completed batch/)
    expectNothingWritten()
  })

  test('an Admin can Process & Grade too, and the lots are on the batch they made', async () => {
    mockAuthUser = admin

    expect((await postBatch({ ...BATCH, hullAndGrade: HULL })).status).toBe(201)
    expect(mockDb.rows('processingBatch')[0].createdById).toBe('admin-1')
    expect(mockDb.rows('greenBeanLot').map(lot => lot.createdById)).toEqual(['admin-1', 'admin-1'])
  })

  test('a Roaster cannot (403), as for any processing batch', async () => {
    mockAuthUser = roaster

    expect((await postBatch({ ...BATCH, hullAndGrade: HULL })).status).toBe(403)
    expectNothingWritten()
  })

  test('without hullAndGrade the parchment still waits for hulling (the workbench flow)', async () => {
    expect((await postBatch(BATCH)).status).toBe(201)

    expect(mockDb.rows('parchmentLot')[0]).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
    expect(mockDb.rows('parchmentWithdrawal')).toEqual([])
    expect(mockDb.rows('greenBeanLot')).toEqual([])
  })

  test('its Hull & Grade voids like a two-step one: the lots go and the parchment is back', async () => {
    expect((await postBatch({ ...BATCH, hullAndGrade: HULL })).status).toBe(201)
    const [parchment] = mockDb.rows('parchmentLot')
    const [hull] = mockDb.rows('parchmentWithdrawal')

    const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/[withdrawalId]/void/route')
    const response = await POST(
      new NextRequest(`http://localhost:3001/api/parchment-lots/${parchment.id}/withdrawals/${hull.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Graded the wrong lot' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: parchment.id, withdrawalId: hull.id }) },
    )

    expect(response.status).toBe(200)
    expect(mockDb.rows('greenBeanLot')).toEqual([])
    expect(mockDb.rows('pricingHistory')).toEqual([])
    expect(mockDb.get('parchmentLot', parchment.id)).toMatchObject({ currentWeightKg: 50, status: 'AwaitingHulling' })
  })
})
