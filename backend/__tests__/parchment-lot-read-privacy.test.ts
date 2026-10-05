/**
 * What the parchment-lots reads hand back beyond the lot itself:
 * - externalSource.importedBy is a user id (who imported the bought-in lot):
 *   only Admin and the importer get it, on the list and by id
 *   (lib/importerPrivacy), and wherever else the parchment is handed back:
 *   bulk-load phase 2 (the parchment list and the parchment behind each
 *   roaster stock row), the green-bean-lots list and by id, the
 *   roaster-inventory list and by id, and an invoice by id (the parchment
 *   behind each line's green bean lot)
 * - the list loads the batch's harvestLot.farmId only so chainScope's
 *   canReadBatch can decide what the reader sees of the batch; it reaches no
 *   reader, while the batch's owner, its farm's farmer and Admin still get
 *   its createdById and status
 *
 * Prisma is a plain mock returning the rows as the queries would; which rows
 * each user gets is covered by each-their-own-scoping.test.ts.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  parchmentLot: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  farm: { findMany: jest.fn() },
  // The other reads that nest the parchment (bulk-load phase 2,
  // green-bean-lots, roaster-inventory, invoices by id).
  greenBeanLot: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  roasterInventoryItem: { findMany: jest.fn(), findUnique: jest.fn() },
  soilAnalysis: { findMany: jest.fn() },
  weatherRecord: { findMany: jest.fn() },
  gAPLogEntry: { findMany: jest.fn() },
  processingBatch: { findMany: jest.fn() },
  roastBatch: { findMany: jest.fn() },
  invoice: { findUnique: jest.fn() },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Real role checks and error handling; only the session is faked.
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
const importer = user('proc-a', ['Processor'])
const otherProcessor = user('proc-b', ['Processor'])
const roaster = user('roaster-a', ['Roaster'])
const farmer = user('farmer-1', ['Farmer'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const cupper = user('cupper-1', ['Cupper'])

const externalLot = () => ({
  id: 'pl-ext',
  sourceType: 'External',
  processingBatchId: null,
  processingBatch: null,
  harvestLot: null,
  externalSource: { code: 'X-1', supplier: 'Doi Coop', importedBy: 'proc-a' },
  physicalTestResults: null,
  withdrawalHistory: [],
})

// As the list loads it: the batch's farm only for canReadBatch.
const internalLot = () => ({
  id: 'pl-int',
  sourceType: 'Internal',
  processingBatchId: 'pb-a',
  processingBatch: {
    id: 'pb-a',
    processType: 'Washed',
    status: 'Completed',
    createdById: 'proc-a',
    harvestLot: { farmId: 'farm-1' },
  },
  harvestLot: { id: 'hl-a', farmerName: 'Somchai', cherryVariety: 'Typica' },
  externalSource: null,
  physicalTestResults: null,
  withdrawalHistory: [],
})

// A green bean lot hulled from the bought-in parchment, with the parchment
// nested as the green-bean-lots and roaster-inventory reads include it.
const greenLotFromExternal = () => ({
  id: 'gbl-ext',
  sourceType: 'Internal',
  createdById: 'proc-a',
  parchmentLotId: 'pl-ext',
  parchmentLot: externalLot(),
  withdrawalHistory: [],
  roasterInventory: [],
  roastBatches: [],
  cuppingScores: [],
})

// The roaster's stock row on that lot.
const stockRow = () => ({
  id: 'inv-1',
  roasterId: 'roaster-a',
  greenBeanLotId: 'gbl-ext',
  greenBeanLot: greenLotFromExternal(),
  roastBatches: [],
})

// An invoice on the roaster's own sale, with a line on that lot.
const invoiceOnExternal = () => ({
  id: 'inv-doc-1',
  saleOrder: { id: 'so-1', createdBy: 'roaster-a', customer: { id: 'cust-1', name: 'Cafe' } },
  creator: { id: 'roaster-a', name: 'roaster-a' },
  items: [{ id: 'ii-1', greenBeanLotId: 'gbl-ext', greenBeanLot: greenLotFromExternal() }],
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.parchmentLot.findMany.mockResolvedValue([externalLot(), internalLot()])
  // The by-id scope check found the lot in the reader's share.
  mockPrisma.parchmentLot.findFirst.mockImplementation(async (args: any) => ({ id: args.where.id }))
  mockPrisma.farm.findMany.mockResolvedValue([{ id: 'farm-1' }])
  mockPrisma.greenBeanLot.findMany.mockResolvedValue([greenLotFromExternal()])
  mockPrisma.greenBeanLot.findUnique.mockResolvedValue(greenLotFromExternal())
  mockPrisma.greenBeanLot.findFirst.mockImplementation(async (args: any) => ({ id: args.where.id }))
  mockPrisma.greenBeanLot.count.mockResolvedValue(1)
  mockPrisma.roasterInventoryItem.findMany.mockResolvedValue([stockRow()])
  mockPrisma.roasterInventoryItem.findUnique.mockResolvedValue(stockRow())
  mockPrisma.invoice.findUnique.mockResolvedValue(invoiceOnExternal())
  for (const model of ['soilAnalysis', 'weatherRecord', 'gAPLogEntry', 'processingBatch', 'roastBatch']) {
    mockPrisma[model].findMany.mockResolvedValue([])
  }
})

async function list(viewer: any) {
  mockAuthUser = viewer
  const { GET } = await import('@/app/api/parchment-lots/route')
  const response = await GET(new NextRequest('http://localhost:3001/api/parchment-lots'))
  expect(response.status).toBe(200)
  const { parchmentLots } = await response.json()
  return Object.fromEntries(parchmentLots.map((lot: any) => [lot.id, lot]))
}

async function open(viewer: any, lot: any) {
  mockAuthUser = viewer
  mockPrisma.parchmentLot.findUnique.mockResolvedValue(lot)
  const { GET } = await import('@/app/api/parchment-lots/[id]/route')
  const response = await GET(new NextRequest(`http://localhost:3001/api/parchment-lots/${lot.id}`), {
    params: Promise.resolve({ id: lot.id }),
  })
  expect(response.status).toBe(200)
  return (await response.json()).parchmentLot
}

describe('externalSource.importedBy', () => {
  test.each([
    ['the importer', importer],
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s gets it, on the list and by id', async (_who, viewer) => {
    expect((await list(viewer))['pl-ext'].externalSource).toEqual({
      code: 'X-1', supplier: 'Doi Coop', importedBy: 'proc-a',
    })
    expect((await open(viewer, externalLot())).externalSource.importedBy).toBe('proc-a')
  })

  test.each([
    ['a roaster reading the parchment behind their green beans', roaster],
    ['another processor', otherProcessor],
    ['a farmer', farmer],
    ['a cupper', cupper],
  ])('%s gets the supplier details without it, on the list and by id', async (_who, viewer) => {
    expect((await list(viewer))['pl-ext'].externalSource).toEqual({ code: 'X-1', supplier: 'Doi Coop' })
    expect((await open(viewer, externalLot())).externalSource).toEqual({ code: 'X-1', supplier: 'Doi Coop' })
  })

  test('the stored row is never changed', async () => {
    const lot = externalLot()
    await open(roaster, lot)
    expect(lot.externalSource.importedBy).toBe('proc-a')
  })

  test('a lot with no externalSource, or none recorded, reads as it is', async () => {
    const lots = await list(roaster)
    expect(lots['pl-int'].externalSource).toBeNull()
    const old = { ...externalLot(), externalSource: { code: 'X-0' } }
    expect((await open(roaster, old)).externalSource).toEqual({ code: 'X-0' })
  })
})

describe("the list's batch", () => {
  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
    ['the batch owner', importer],
    ["the farm's farmer", farmer],
  ])('%s still gets its owner and status, but not the farm loaded for the check', async (_who, viewer) => {
    const { processingBatch } = (await list(viewer))['pl-int']
    expect(processingBatch).toEqual({ id: 'pb-a', processType: 'Washed', status: 'Completed', createdById: 'proc-a' })
    expect(processingBatch.harvestLot).toBeUndefined()
  })

  test('a reader who may not read the batch gets its id and process only', async () => {
    const { processingBatch } = (await list(roaster))['pl-int']
    expect(processingBatch).toEqual({ id: 'pb-a', processType: 'Washed' })
  })

  test('a lot with no batch has none', async () => {
    expect((await list(admin))['pl-ext'].processingBatch).toBeNull()
  })
})

// Each read that hands back the bought-in parchment, and where it sits in
// the response.
const nestedReads: [string, () => Promise<{ externalSource: any }>][] = [
  ['bulk-load phase 2, the parchment list', async () => {
    const { GET } = await import('@/app/api/bulk-load/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/bulk-load?phase=2')))
    return body.parchmentLots.find((lot: any) => lot.id === 'pl-ext')
  }],
  ['bulk-load phase 2, the parchment behind a roaster stock row', async () => {
    const { GET } = await import('@/app/api/bulk-load/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/bulk-load?phase=2')))
    return body.roasterInventory[0].greenBeanLot.parchmentLot
  }],
  ['the green-bean-lots list', async () => {
    const { GET } = await import('@/app/api/green-bean-lots/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/green-bean-lots')))
    return body.greenBeanLots[0].parchmentLot
  }],
  ['a green bean lot by id', async () => {
    const { GET } = await import('@/app/api/green-bean-lots/[id]/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/green-bean-lots/gbl-ext'), {
      params: Promise.resolve({ id: 'gbl-ext' }),
    }))
    return body.greenBeanLot.parchmentLot
  }],
  ['the roaster-inventory list', async () => {
    const { GET } = await import('@/app/api/roaster-inventory/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/roaster-inventory')))
    return body.inventoryItems[0].greenBeanLot.parchmentLot
  }],
  ['a roaster stock row by id', async () => {
    const { GET } = await import('@/app/api/roaster-inventory/[id]/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/roaster-inventory/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    }))
    return body.inventoryItem.greenBeanLot.parchmentLot
  }],
  ['an invoice by id, the parchment behind a line', async () => {
    const { GET } = await import('@/app/api/invoices/[id]/route')
    const body = await ok(GET(new NextRequest('http://localhost:3001/api/invoices/inv-doc-1'), {
      params: Promise.resolve({ id: 'inv-doc-1' }),
    }))
    return body.invoice.items[0].greenBeanLot.parchmentLot
  }],
]

async function ok(pending: Promise<Response>) {
  const response = await pending
  expect(response.status).toBe(200)
  return response.json()
}

describe('the parchment nested in the other reads', () => {
  test.each(nestedReads)('%s: a roaster gets the supplier details without the importer', async (_read, read) => {
    mockAuthUser = roaster
    expect((await read()).externalSource).toEqual({ code: 'X-1', supplier: 'Doi Coop' })
  })

  test.each(nestedReads)('%s: an Admin still gets the importer', async (_read, read) => {
    mockAuthUser = admin
    expect((await read()).externalSource.importedBy).toBe('proc-a')
  })
})

describe('an invoice by id', () => {
  test('keeps the rest of the invoice and its lines as read', async () => {
    mockAuthUser = roaster
    const { GET } = await import('@/app/api/invoices/[id]/route')
    const { invoice } = await ok(GET(new NextRequest('http://localhost:3001/api/invoices/inv-doc-1'), {
      params: Promise.resolve({ id: 'inv-doc-1' }),
    }))
    const { greenBeanLot, ...line } = invoice.items[0]
    expect(line).toEqual({ id: 'ii-1', greenBeanLotId: 'gbl-ext' })
    expect(greenBeanLot.id).toBe('gbl-ext')
    expect(greenBeanLot.parchmentLot.id).toBe('pl-ext')
    expect(invoice.saleOrder).toEqual(invoiceOnExternal().saleOrder)
    expect(invoice.creator).toEqual({ id: 'roaster-a', name: 'roaster-a' })
  })

  test('another roaster still cannot read it (403)', async () => {
    mockAuthUser = user('roaster-b', ['Roaster'])
    const { GET } = await import('@/app/api/invoices/[id]/route')
    const response = await GET(new NextRequest('http://localhost:3001/api/invoices/inv-doc-1'), {
      params: Promise.resolve({ id: 'inv-doc-1' }),
    })
    expect(response.status).toBe(403)
  })
})
