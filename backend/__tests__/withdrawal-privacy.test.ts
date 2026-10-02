/**
 * F8: green-bean and parchment withdrawals carry the sale behind them
 * (customer, delivery address, price, total, invoice number, target roaster).
 * Lots are readable by every role, so only the lot's owner and Admin may see
 * those columns; everyone else gets type, kg, date and purpose. One helper
 * (lib/withdrawalPrivacy) shapes every route that returns withdrawal history.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  farm: { findMany: jest.fn() },
  soilAnalysis: { findMany: jest.fn() },
  weatherRecord: { findMany: jest.fn() },
  gAPLogEntry: { findMany: jest.fn() },
  processingBatch: { findMany: jest.fn() },
  parchmentLot: { findMany: jest.fn() },
  greenBeanLot: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  roasterInventoryItem: { findMany: jest.fn() },
  roastBatch: { findMany: jest.fn() },
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
  requireRole: jest.fn(),
  requireOwnership: jest.fn(),
  handleApiError: jest.fn((error: any) => {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const user = (id: string, roles: string[], isSuperAdmin = false) => ({ id, roles, isSuperAdmin })

const owner = user('processor-1', ['Processor'])
const ownerFarmerProcessor = user('processor-1', ['Farmer', 'Processor'])
const otherProcessor = user('processor-2', ['Processor'])
const roaster = user('roaster-1', ['Roaster'])
const cupper = user('cupper-1', ['Cupper'])
const headJudge = user('judge-1', ['HeadJudge'])
const farmer = user('farmer-1', ['Farmer'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', ['Processor'], true)

// Columns nobody but the owner and Admin may read.
const SALE_FIELDS = [
  'customerName',
  'deliveryAddress',
  'salePrice',
  'currency',
  'totalAmount',
  'invoiceNumber',
  'notes',
  'targetRoasterId',
  'roastProfileNotes',
]

const greenSale = () => ({
  id: 'gw-1',
  greenBeanLotId: 'gbl-1',
  amountKg: 5,
  withdrawalType: 'Sale',
  purpose: 'Sale to cafe',
  notes: 'Call Khun Somchai on 081-234-5678',
  date: '2026-09-20T00:00:00.000Z',
  withdrawnBy: 'processor-1',
  withdrawnByName: 'Proc One',
  salePrice: 400,
  currency: 'THB',
  customerName: 'Cafe Doi',
  invoiceNumber: 'INV-2026-0042',
  deliveryAddress: '12 Nimman Rd, Chiang Mai',
  totalAmount: 2000,
  createdAt: '2026-09-20T01:00:00.000Z',
  withdrawnByUser: { id: 'processor-1', name: 'Proc One' },
})

const greenPublic = {
  id: 'gw-1',
  greenBeanLotId: 'gbl-1',
  amountKg: 5,
  withdrawalType: 'Sale',
  purpose: 'Sale to cafe',
  date: '2026-09-20T00:00:00.000Z',
  withdrawnBy: 'processor-1',
  withdrawnByName: 'Proc One',
  createdAt: '2026-09-20T01:00:00.000Z',
  withdrawnByUser: { id: 'processor-1', name: 'Proc One' },
  // Tells the client the sale was withheld, so it offers no invoice.
  saleDetailsHidden: true,
}

const greenLot = () => ({
  id: 'gbl-1',
  grade: 'Grade A',
  createdById: 'processor-1',
  currentWeightKg: 40,
  withdrawalHistory: [greenSale()],
  roasterInventory: [
    { id: 'inv-1', roasterId: 'roaster-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 10, remainingWeightKg: 8 },
    { id: 'inv-2', roasterId: 'roaster-2', greenBeanLotId: 'gbl-1', claimedWeightKg: 15, remainingWeightKg: 15 },
  ],
  // GET /green-bean-lots/:id loads every roast on the lot.
  roastBatches: [
    { id: 'rb-1', roasterId: 'roaster-1', roasterInventoryId: 'inv-1', batchSizeKg: 2, roastedWeightKg: 1.7, roastProfileNotes: 'Mine' },
    { id: 'rb-2', roasterId: 'roaster-2', roasterInventoryId: 'inv-2', batchSizeKg: 6, roastedWeightKg: 5.1, roastProfileNotes: 'Theirs' },
    { id: 'rb-3', roasterId: 'roaster-3', roasterInventoryId: 'inv-3', batchSizeKg: 4, roastedWeightKg: 3.4, roastProfileNotes: 'Theirs too' },
  ],
})

const parchmentRoastingStock = () => ({
  id: 'pw-1',
  parchmentLotId: 'pl-1',
  amountKg: 20,
  withdrawalType: 'Sale',
  purpose: 'Sale to mill',
  notes: 'Deliver to back gate',
  date: '2026-09-21T00:00:00.000Z',
  withdrawnBy: 'processor-1',
  withdrawnByName: 'Proc One',
  salePrice: 150,
  currency: 'THB',
  customerName: 'Mill Co',
  deliveryAddress: '99 Mae Rim',
  totalAmount: 3000,
  targetRoasterId: 'roaster-1',
  roastProfileNotes: 'Light, 10 min',
  cuppingScore: 85,
  createdAt: '2026-09-21T01:00:00.000Z',
})

const parchmentPublic = {
  id: 'pw-1',
  parchmentLotId: 'pl-1',
  amountKg: 20,
  withdrawalType: 'Sale',
  purpose: 'Sale to mill',
  date: '2026-09-21T00:00:00.000Z',
  withdrawnBy: 'processor-1',
  withdrawnByName: 'Proc One',
  // Not sale data, and cupping fields are hands-off: left as it was.
  cuppingScore: 85,
  createdAt: '2026-09-21T01:00:00.000Z',
  saleDetailsHidden: true,
}

const parchmentLot = (createdById: string | null = 'processor-1') => ({
  id: 'pl-1',
  processType: 'Washed',
  processingBatch: createdById === null ? null : { id: 'pb-1', processType: 'Washed', status: 'Completed', createdById },
  withdrawalHistory: [parchmentRoastingStock()],
})

const request = (url: string) => new NextRequest(`http://localhost:3001${url}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const nonOwners: [string, any][] = [
  ['another Processor', otherProcessor],
  ['a Roaster', roaster],
  ['a Cupper', cupper],
  ['a HeadJudge', headJudge],
  ['a Farmer on their own lot', farmer],
]

const privileged: [string, any][] = [
  ['the owner', owner],
  ['the owner with several roles', ownerFarmerProcessor],
  ['an Admin', admin],
  ['a super admin', superAdmin],
]

function expectNoSaleFields(rows: any[]) {
  for (const row of rows) {
    for (const field of SALE_FIELDS) expect(row).not.toHaveProperty(field)
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  for (const model of Object.values(mockPrisma) as any[]) {
    model.findMany?.mockResolvedValue([])
  }
  mockPrisma.greenBeanLot.count.mockResolvedValue(1)
})

describe('lib/withdrawalPrivacy', () => {
  test('publicWithdrawal keeps only type, kg, date, purpose and who recorded it', async () => {
    const { publicWithdrawal } = await import('@/lib/withdrawalPrivacy')
    expect(publicWithdrawal(greenSale())).toEqual(greenPublic)
    expect(publicWithdrawal(parchmentRoastingStock())).toEqual(parchmentPublic)
  })

  test("an owner's rows carry no saleDetailsHidden flag; a non-owner's do", async () => {
    const { greenBeanLotForViewer } = await import('@/lib/withdrawalPrivacy')
    expect(greenBeanLotForViewer(owner as any, greenLot()).withdrawalHistory[0]).not.toHaveProperty('saleDetailsHidden')
    expect((greenBeanLotForViewer(otherProcessor as any, greenLot()).withdrawalHistory[0] as any).saleDetailsHidden).toBe(true)
  })

  test('a column the list does not name stays private', async () => {
    const { publicWithdrawal } = await import('@/lib/withdrawalPrivacy')
    expect(publicWithdrawal({ ...greenSale(), taxId: '0105551234567' })).not.toHaveProperty('taxId')
  })

  test('canSeeWithdrawalSales: owner, Admin and super admin only', async () => {
    const { canSeeWithdrawalSales } = await import('@/lib/withdrawalPrivacy')
    expect(canSeeWithdrawalSales(owner as any, 'processor-1')).toBe(true)
    expect(canSeeWithdrawalSales(admin as any, 'processor-1')).toBe(true)
    expect(canSeeWithdrawalSales(superAdmin as any, 'processor-1')).toBe(true)
    expect(canSeeWithdrawalSales(otherProcessor as any, 'processor-1')).toBe(false)
    // A lot with no owner on record (Excel-imported parchment) is Admin-only.
    expect(canSeeWithdrawalSales(owner as any, null)).toBe(false)
    expect(canSeeWithdrawalSales(admin as any, null)).toBe(true)
  })

  test('a lot without withdrawals loaded passes through unchanged', async () => {
    const { greenBeanLotForViewer, parchmentLotForViewer } = await import('@/lib/withdrawalPrivacy')
    const lot = { id: 'gbl-1', createdById: 'processor-1' }
    expect(greenBeanLotForViewer(roaster as any, lot)).toEqual(lot)
    expect(parchmentLotForViewer(roaster as any, { id: 'pl-1', processingBatch: null })).toEqual({
      id: 'pl-1',
      processingBatch: null,
    })
  })
})

describe('GET /api/green-bean-lots', () => {
  const list = async () => {
    const { GET } = await import('@/app/api/green-bean-lots/route')
    const response = await GET(request('/api/green-bean-lots'))
    expect(response.status).toBe(200)
    return (await response.json()).greenBeanLots
  }

  test.each(nonOwners)('%s gets the withdrawal history without the sale', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findMany.mockResolvedValue([greenLot()])
    const [lot] = await list()
    expect(lot.withdrawalHistory).toEqual([greenPublic])
    expectNoSaleFields(lot.withdrawalHistory)
    expect(lot.grade).toBe('Grade A')
  })

  test.each(privileged)('%s gets the full sale', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findMany.mockResolvedValue([greenLot()])
    const [lot] = await list()
    expect(lot.withdrawalHistory).toEqual([greenSale()])
  })

  test('each lot is judged on its own owner', async () => {
    mockAuthUser = owner
    mockPrisma.greenBeanLot.findMany.mockResolvedValue([
      greenLot(),
      { ...greenLot(), id: 'gbl-2', createdById: 'processor-2' },
    ])
    const [mine, theirs] = await list()
    expect(mine.withdrawalHistory[0].customerName).toBe('Cafe Doi')
    expect(theirs.withdrawalHistory).toEqual([greenPublic])
  })
})

describe('GET /api/green-bean-lots/:id', () => {
  const detail = async () => {
    const { GET } = await import('@/app/api/green-bean-lots/[id]/route')
    const response = await GET(request('/api/green-bean-lots/gbl-1'), params('gbl-1'))
    expect(response.status).toBe(200)
    return (await response.json()).greenBeanLot
  }

  test.each(nonOwners)('%s gets no sale details', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLot())
    const lot = await detail()
    expect(lot.withdrawalHistory).toEqual([greenPublic])
    expectNoSaleFields(lot.withdrawalHistory)
  })

  test("a Roaster sees their own stock row on the lot, not other roasters'", async () => {
    mockAuthUser = roaster
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLot())
    const lot = await detail()
    expect(lot.roasterInventory.map((row: any) => row.id)).toEqual(['inv-1'])
  })

  test('a Cupper sees no roaster stock rows', async () => {
    mockAuthUser = cupper
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLot())
    const lot = await detail()
    expect(lot.roasterInventory).toEqual([])
  })

  test("a Roaster sees their own roasts on the lot, not other roasters'", async () => {
    // Other roasters' roasts would say who took the lot, how many kg each
    // used, and their roast profiles.
    mockAuthUser = roaster
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLot())
    const lot = await detail()
    expect(lot.roastBatches.map((row: any) => row.id)).toEqual(['rb-1'])
  })

  test.each(nonOwners.filter(([, viewer]) => viewer !== roaster))('%s sees no roasts on the lot', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLot())
    const lot = await detail()
    expect(lot.roastBatches).toEqual([])
  })

  test.each(privileged)('%s gets the full sale, every stock row and every roast', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLot())
    const lot = await detail()
    expect(lot.withdrawalHistory).toEqual([greenSale()])
    expect(lot.roasterInventory.map((row: any) => row.id)).toEqual(['inv-1', 'inv-2'])
    expect(lot.roastBatches.map((row: any) => row.id)).toEqual(['rb-1', 'rb-2', 'rb-3'])
  })
})

describe('GET /api/parchment-lots', () => {
  const list = async () => {
    const { GET } = await import('@/app/api/parchment-lots/route')
    const response = await GET(request('/api/parchment-lots'))
    expect(response.status).toBe(200)
    return (await response.json()).parchmentLots
  }

  test('loads the batch creator, so the owner check has something to compare', async () => {
    mockAuthUser = owner
    await list()
    const include = mockPrisma.parchmentLot.findMany.mock.calls[0][0].include
    expect(include.processingBatch.select.createdById).toBe(true)
  })

  test.each(nonOwners)('%s gets the withdrawal history without the sale', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.parchmentLot.findMany.mockResolvedValue([parchmentLot()])
    const [lot] = await list()
    expect(lot.withdrawalHistory).toEqual([parchmentPublic])
    expectNoSaleFields(lot.withdrawalHistory)
  })

  test.each(privileged)('%s gets the full sale', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.parchmentLot.findMany.mockResolvedValue([parchmentLot()])
    const [lot] = await list()
    expect(lot.withdrawalHistory).toEqual([parchmentRoastingStock()])
  })

  test('a lot with no processing batch shows its sales to Admin only', async () => {
    mockPrisma.parchmentLot.findMany.mockResolvedValue([parchmentLot(null)])
    mockAuthUser = owner
    expect((await list())[0].withdrawalHistory).toEqual([parchmentPublic])
    mockAuthUser = admin
    expect((await list())[0].withdrawalHistory).toEqual([parchmentRoastingStock()])
  })
})

describe('GET /api/bulk-load?phase=2', () => {
  const phase2 = async () => {
    const { GET } = await import('@/app/api/bulk-load/route')
    const response = await GET(request('/api/bulk-load?phase=2'))
    expect(response.status).toBe(200)
    return response.json()
  }

  test.each(nonOwners)('%s gets green-bean withdrawals without the sale', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findMany.mockResolvedValue([greenLot()])
    const body = await phase2()
    expect(body.greenBeanLots[0].withdrawalHistory).toEqual([greenPublic])
    expectNoSaleFields(body.greenBeanLots[0].withdrawalHistory)
  })

  test.each(privileged)('%s gets the full sale', async (_who, viewer) => {
    mockAuthUser = viewer
    mockPrisma.greenBeanLot.findMany.mockResolvedValue([greenLot()])
    const body = await phase2()
    expect(body.greenBeanLots[0].withdrawalHistory).toEqual([greenSale()])
  })
})
