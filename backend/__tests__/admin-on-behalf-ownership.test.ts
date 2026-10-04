/**
 * A record an Admin creates on someone's behalf belongs to that someone.
 *
 * Hull & Grade (POST /api/parchment-lots/:id/withdrawals) made its green-bean
 * lots with createdById = the caller, so when an Admin hulled a processor's
 * parchment the lots became the Admin's: the processor could no longer price,
 * sell or withdraw them, and saw their sales hidden. The lots now belong to
 * the parchment's owner (parchmentLot -> processingBatch.createdById). The
 * same goes for POST /api/green-bean-lots naming a processor's parchment.
 * Who did it is still on record: the withdrawal's withdrawnBy and the price's
 * priceSetBy stay the Admin.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockTx: any = {
  greenBeanLot: { create: jest.fn() },
  parchmentLot: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  parchmentWithdrawal: { create: jest.fn() },
  pricingHistory: { create: jest.fn() },
}

const mockPrisma: any = {
  greenBeanLot: { findMany: jest.fn(), create: jest.fn() },
  parchmentLot: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(async (callback: any) => callback(mockTx)),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Real role, ownership and error handling; only the session is faked.
let mockAuthUser: any = null
jest.mock('@/lib/middleware', () => {
  const actual = jest.requireActual('@/lib/middleware') as Record<string, unknown>
  return {
    ...actual,
    requireAuth: jest.fn(async () => {
      if (!mockAuthUser) throw new Error('Unauthorized')
      return mockAuthUser
    }),
  }
})

const user = (id: string, roles: string[], isSuperAdmin = false) => ({
  id, email: null, username: null, name: id, roles, isActive: true, isSuperAdmin,
})
const processor = user('processor-1', ['Processor'])
const otherProcessor = user('processor-2', ['Processor'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)

// processor-1's parchment, or bought-in parchment with no batch (null).
const PROCESSOR_LOT = '11111111-1111-4111-8111-111111111111'
const BOUGHT_IN_LOT = '22222222-2222-4222-8222-222222222222'
let batchOwner: string | null = 'processor-1'

const hull = async () => {
  const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
  return POST(
    new NextRequest('http://localhost:3001/api/parchment-lots/pl-1/withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountKg: 100,
        withdrawalType: 'HullAndGrade',
        purpose: 'Hull and grade',
        totalGreenBeanWeight: 80,
        gradedLots: [
          { grade: 'AA', weight: 50, price: 320 },
          { grade: 'AB', weight: 30 },
        ],
      }),
    }),
    { params: Promise.resolve({ id: 'pl-1' }) },
  )
}

const createLot = async (body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/green-bean-lots/route')
  return POST(new NextRequest('http://localhost:3001/api/green-bean-lots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

const hulledLots = () => mockTx.greenBeanLot.create.mock.calls.map((call: any[]) => call[0].data)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  batchOwner = 'processor-1'
  mockPrisma.greenBeanLot.findMany.mockResolvedValue([])
  mockPrisma.parchmentLot.findUnique.mockImplementation(async (args: any) => {
    if (args.include?.processingBatch) {
      return { id: 'pl-1', currentWeightKg: 100, processingBatch: batchOwner ? { createdById: batchOwner } : null }
    }
    if (args.include?.withdrawalHistory) return { id: 'pl-1', currentWeightKg: 0, withdrawalHistory: [] }
    // POST /api/green-bean-lots reads the parchment's owner by id.
    if (args.where.id === PROCESSOR_LOT) return { processingBatch: { createdById: 'processor-1' } }
    if (args.where.id === BOUGHT_IN_LOT) return { processingBatch: null }
    return null
  })
  mockPrisma.greenBeanLot.create.mockImplementation(async ({ data }: any) => ({ id: 'new-lot', ...data }))
  mockTx.parchmentLot.updateMany.mockResolvedValue({ count: 1 })
  mockTx.parchmentLot.findUnique.mockResolvedValue({ currentWeightKg: 0 })
  mockTx.parchmentLot.update.mockResolvedValue({})
  mockTx.parchmentWithdrawal.create.mockResolvedValue({ id: 'pw-1' })
  let made = 0
  mockTx.greenBeanLot.create.mockImplementation(async ({ data }: any) => ({ id: `gbl-${++made}`, ...data }))
  mockTx.pricingHistory.create.mockResolvedValue({})
})

describe('Hull & Grade: the green-bean lots belong to the parchment owner', () => {
  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])("%s hulling a processor's parchment leaves the lots with that processor", async (_label, viewer) => {
    mockAuthUser = viewer
    const response = await hull()
    expect(response.status).toBe(201)
    expect(hulledLots().map((lot: any) => lot.createdById)).toEqual(['processor-1', 'processor-1'])
    const body: any = await response.json()
    expect(body.greenBeanLots.map((lot: any) => lot.createdById)).toEqual(['processor-1', 'processor-1'])
  })

  test('who did it stays on record: the withdrawal and the price name the Admin', async () => {
    mockAuthUser = admin
    await hull()
    expect(mockTx.parchmentWithdrawal.create.mock.calls[0][0].data.withdrawnBy).toBe('admin-1')
    const [priced] = hulledLots()
    expect(priced.priceSetBy).toBe('admin-1')
    expect(mockTx.pricingHistory.create.mock.calls[0][0].data.setBy).toBe('admin-1')
  })

  test('the processor hulling their own parchment owns the lots, as before', async () => {
    mockAuthUser = processor
    const response = await hull()
    expect(response.status).toBe(201)
    expect(hulledLots().map((lot: any) => lot.createdById)).toEqual(['processor-1', 'processor-1'])
  })

  test("another processor still cannot hull someone else's parchment", async () => {
    mockAuthUser = otherProcessor
    const response = await hull()
    expect(response.status).toBe(403)
    expect(mockTx.greenBeanLot.create).not.toHaveBeenCalled()
  })

  test('bought-in parchment has no owner on record, so the Admin who hulls it owns the lots', async () => {
    batchOwner = null
    mockAuthUser = admin
    const response = await hull()
    expect(response.status).toBe(201)
    expect(hulledLots().map((lot: any) => lot.createdById)).toEqual(['admin-1', 'admin-1'])
  })
})

describe('POST /api/green-bean-lots: a lot from parchment belongs to the parchment owner', () => {
  const internalLot = (parchmentLotId: string) => ({
    sourceType: 'Internal',
    parchmentLotId,
    grade: 'Grade A',
    initialWeightKg: 50,
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])("%s recording a lot from a processor's parchment records it as that processor's", async (_label, viewer) => {
    mockAuthUser = viewer
    const response = await createLot(internalLot(PROCESSOR_LOT))
    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create.mock.calls[0][0].data.createdById).toBe('processor-1')
  })

  test('the processor recording a lot from their own parchment owns it, as before', async () => {
    mockAuthUser = processor
    const response = await createLot(internalLot(PROCESSOR_LOT))
    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create.mock.calls[0][0].data.createdById).toBe('processor-1')
  })

  test('an Admin recording a lot from bought-in parchment owns it', async () => {
    mockAuthUser = admin
    const response = await createLot(internalLot(BOUGHT_IN_LOT))
    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create.mock.calls[0][0].data.createdById).toBe('admin-1')
  })

  test('an Admin adding a purchased lot with no parchment owns it', async () => {
    mockAuthUser = admin
    const response = await createLot({
      sourceType: 'External',
      grade: 'Grade A',
      initialWeightKg: 60,
      externalSource: { originName: 'Ethiopia', variety: 'Heirloom', processType: 'Washed' },
    })
    expect(response.status).toBe(201)
    expect(mockPrisma.greenBeanLot.create.mock.calls[0][0].data.createdById).toBe('admin-1')
  })
})
