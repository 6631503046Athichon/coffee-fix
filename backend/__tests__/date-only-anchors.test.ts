/**
 * Thai year and 12:00 UTC date anchors on the routes that still used the
 * server's UTC clock or new Date('YYYY-MM-DD') (00:00 UTC).
 *
 * - Sale order and invoice numbers default to the Thai year (businessYear),
 *   so ORD/INV numbers taken before 07:00 on 1 January are not last year's.
 * - POST /api/backfill-display-ids numbers a legacy row by the Thai year of
 *   its createdAt, like new rows and scripts/maintenance/populate-display-ids.
 * - Invoice issue / due dates, an edited roast date, drying logs and GAP logs
 *   store a picked YYYY-MM-DD at 12:00 UTC, so a viewer west of UTC does not
 *   see the day before. A full ISO datetime is still stored as that instant.
 *
 * Railway runs on UTC. This machine may not, and a test cannot switch the
 * process time zone (jest sandboxes process.env), so onUtcServer() points
 * getFullYear at getUTCFullYear, which is what it does on a UTC server.
 * Only Date is faked by at().
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemorySequence } from './helpers/memorySequence'

const mockSequence = createMemorySequence()

const mockPrisma: any = {
  saleOrder: { findFirst: jest.fn(), findUnique: jest.fn() },
  invoice: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  invoiceItem: { create: jest.fn() },
  harvestLot: { findMany: jest.fn(), update: jest.fn() },
  processingBatch: { findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  parchmentLot: { findMany: jest.fn(), update: jest.fn() },
  greenBeanLot: { findMany: jest.fn(), update: jest.fn() },
  roastBatch: { findUnique: jest.fn(), updateMany: jest.fn() },
  roasterInventoryItem: { updateMany: jest.fn(), update: jest.fn() },
  dryingLogEntry: { create: jest.fn() },
  gAPLogEntry: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  activityType: { findUnique: jest.fn() },
  farm: { findUnique: jest.fn() },
  $queryRaw: (...args: any[]) => (mockSequence.queryRaw as any)(...args),
  $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
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
    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message === 'Insufficient permissions'
          ? 403
          : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const NativeDatePrototype = Date.prototype

function onUtcServer() {
  jest.spyOn(NativeDatePrototype, 'getFullYear').mockImplementation(function (this: Date) {
    return this.getUTCFullYear()
  })
}

/** Pins the clock (Date only; timers and promises run as usual). */
function at(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
}

const admin = { id: 'admin-1', name: 'Admin', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const roaster = { id: 'roaster-1', name: 'Roaster', roles: ['Roaster'], isActive: true, isSuperAdmin: false }
const processor = { id: 'processor-1', name: 'Processor', roles: ['Processor'], isActive: true, isSuperAdmin: false }

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3001${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const noon = (day: string) => new Date(`${day}T12:00:00.000Z`)

beforeEach(() => {
  jest.clearAllMocks()
  onUtcServer()
  mockSequence.reset()
  mockAuthUser = null
  mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma))
  mockPrisma.saleOrder.findFirst.mockResolvedValue(null)
  mockPrisma.invoice.findFirst.mockResolvedValue(null)
  for (const model of ['harvestLot', 'processingBatch', 'parchmentLot', 'greenBeanLot']) {
    mockPrisma[model].findMany.mockResolvedValue([])
    mockPrisma[model].update.mockResolvedValue({})
  }
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('sale order and invoice numbers default to the Thai year', () => {
  test('00:30 on 1 January in Thailand (17:30 UTC on 31 December) numbers with the new year', async () => {
    at('2026-12-31T17:30:00.000Z')
    const { getNextSaleOrderNumber, getNextInvoiceNumber } = await import('@/lib/documentNumbers')

    expect(await getNextSaleOrderNumber()).toBe('ORD-2027-0001')
    expect(await getNextInvoiceNumber()).toBe('INV-2027-0001')
    expect(mockPrisma.saleOrder.findFirst.mock.calls[0][0].where).toEqual({
      orderNumber: { startsWith: 'ORD-2027-' },
    })
    expect(mockSequence.counters()).toEqual({ 'ORD-2027': 1, 'INV-2027': 1 })
  })

  test('23:59 on 31 December in Thailand is still the old year', async () => {
    at('2026-12-31T16:59:00.000Z')
    const { getNextSaleOrderNumber, getNextInvoiceNumber } = await import('@/lib/documentNumbers')

    expect(await getNextSaleOrderNumber()).toBe('ORD-2026-0001')
    expect(await getNextInvoiceNumber()).toBe('INV-2026-0001')
  })

  test('an explicit year still wins, and the DocumentSequence floor still applies', async () => {
    at('2026-12-31T17:30:00.000Z')
    mockPrisma.saleOrder.findFirst.mockResolvedValueOnce({ orderNumber: 'ORD-2026-0007' })
    const { getNextSaleOrderNumber } = await import('@/lib/documentNumbers')

    expect(await getNextSaleOrderNumber(2026)).toBe('ORD-2026-0008')
  })
})

describe('POST /api/backfill-display-ids numbers by the Thai year of createdAt', () => {
  const backfill = async (dryRun = false) => {
    const { POST } = await import('@/app/api/backfill-display-ids/route')
    return POST(request(`/api/backfill-display-ids${dryRun ? '?dryRun=true' : ''}`, 'POST'))
  }

  const legacyRows = (rows: Array<{ id: string; createdAt: Date }>) => {
    mockPrisma.harvestLot.findMany.mockImplementation(async (args: any) =>
      args.where.displayId === null ? rows : [],
    )
  }

  test('a row created 2026-12-31T18:00Z (01:00 on 1 January 2027 in Thailand) gets HL-2027-1', async () => {
    mockAuthUser = admin
    legacyRows([{ id: 'legacy', createdAt: new Date('2026-12-31T18:00:00.000Z') }])

    const response = await backfill()

    expect(response.status).toBe(200)
    expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith({
      where: { id: 'legacy' },
      data: { displayId: 'HL-2027-1' },
    })
    // The year's existing numbers are read from the 2027 series, not 2026.
    expect(mockPrisma.harvestLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { displayId: { startsWith: 'HL-2027-' } } }),
    )
    expect((await response.json()).results.HarvestLot).toEqual({
      updated: 1,
      details: { '2027': 1 },
    })
    expect(mockSequence.counters()).toEqual({ 'HL-2027': 1 })
  })

  test('a row created 2026-12-31T16:00Z (23:00 Thai on 31 December) stays in 2026', async () => {
    mockAuthUser = admin
    legacyRows([{ id: 'late', createdAt: new Date('2026-12-31T16:00:00.000Z') }])

    const response = await backfill()

    expect(response.status).toBe(200)
    expect(mockPrisma.harvestLot.update).toHaveBeenCalledWith({
      where: { id: 'late' },
      data: { displayId: 'HL-2026-1' },
    })
  })

  test('a dry run reports the Thai year without writing', async () => {
    mockAuthUser = admin
    legacyRows([{ id: 'legacy', createdAt: new Date('2026-12-31T18:00:00.000Z') }])

    const response = await backfill(true)

    expect(response.status).toBe(200)
    expect((await response.json()).results.HarvestLot.details).toEqual({ '2027': 1 })
    expect(mockPrisma.harvestLot.update).not.toHaveBeenCalled()
  })
})

describe('POST /api/invoices stores issue and due dates as calendar days', () => {
  const ORDER_ID = 'e5dd3ab0-ad1b-4aaa-9b34-cea608765224'

  beforeEach(() => {
    mockPrisma.saleOrder.findUnique.mockResolvedValue({
      id: ORDER_ID,
      createdBy: 'roaster-1',
      status: 'Confirmed',
      totalAmount: 950,
      currency: 'THB',
      items: [
        { greenBeanLotId: 'lot-1', lotGrade: 'Grade A', quantity: 2.5, pricePerKg: 380, subtotal: 950 },
      ],
    })
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: 'invoice-1', ...data }))
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1' })
  })

  const postInvoice = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/invoices/route')
    return POST(request('/api/invoices', 'POST', { saleOrderId: ORDER_ID, ...body }))
  }
  const createdData = () => mockPrisma.invoice.create.mock.calls[0][0].data

  test('no issue date at 01:30 Thai time on 1 January is the Thai today, numbered with the new year', async () => {
    mockAuthUser = roaster
    at('2026-12-31T18:30:00.000Z')

    const response = await postInvoice({})

    expect(response.status).toBe(201)
    expect(createdData().issueDate).toEqual(noon('2027-01-01'))
    expect(createdData().dueDate).toBeNull()
    expect(createdData().invoiceNumber).toBe('INV-2027-0001')
  })

  test('picked issue and due dates are stored at 12:00 UTC', async () => {
    mockAuthUser = roaster
    at('2026-10-05T03:00:00.000Z')

    const response = await postInvoice({ issueDate: '2026-10-05', dueDate: '2026-10-20' })

    expect(response.status).toBe(201)
    expect(createdData().issueDate).toEqual(noon('2026-10-05'))
    expect(createdData().dueDate).toEqual(noon('2026-10-20'))
  })

  test('a due date on the (default) issue day passes, even late in the Thai day', async () => {
    mockAuthUser = roaster
    // 22:00 Thai time on 5 October: the old 00:00 UTC due date sat before
    // the issue instant and was refused.
    at('2026-10-05T15:00:00.000Z')

    const response = await postInvoice({ dueDate: '2026-10-05' })

    expect(response.status).toBe(201)
    expect(createdData().issueDate).toEqual(noon('2026-10-05'))
    expect(createdData().dueDate).toEqual(noon('2026-10-05'))
  })

  test('a due date before the issue date is still refused', async () => {
    mockAuthUser = roaster
    at('2026-10-05T03:00:00.000Z')

    const response = await postInvoice({ issueDate: '2026-10-05', dueDate: '2026-10-04' })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Due date cannot be earlier than the issue date')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('a day that does not exist is refused, not rolled over', async () => {
    mockAuthUser = roaster

    const response = await postInvoice({ issueDate: '2026-02-30' })

    expect(response.status).toBe(400)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('GET breaks a same-day issue date tie by createdAt, newest first', async () => {
    mockAuthUser = roaster
    mockPrisma.invoice.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/invoices/route')

    const response = await GET(request('/api/invoices', 'GET'))

    expect(response.status).toBe(200)
    expect(mockPrisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual([
      { issueDate: 'desc' },
      { createdAt: 'desc' },
    ])
  })
})

describe('PUT /api/roast-batches/[id] stores an edited roast date at 12:00 UTC', () => {
  const existingUpdatedAt = new Date('2026-09-20T10:00:00.000Z')
  const existingRoast = {
    id: 'roast-1',
    updatedAt: existingUpdatedAt,
    roasterId: 'roaster-1',
    roasterInventoryId: 'inv-1',
    greenBeanLotId: 'lot-1',
    roastDate: new Date('2026-09-20T03:00:00.000Z'),
    batchSizeKg: 10,
    roastedWeightKg: 8.5,
    soldWeightKg: 0,
    roastLevel: 'Medium',
    roastProfileNotes: 'No notes',
    flavorNotes: null,
  }
  const routeParams = { params: Promise.resolve({ id: 'roast-1' }) }

  beforeEach(() => {
    mockPrisma.roastBatch.findUnique.mockImplementation(async ({ include }: any) =>
      include ? { ...existingRoast, roasterInventory: { id: 'inv-1' } } : existingRoast,
    )
    mockPrisma.roastBatch.updateMany.mockResolvedValue({ count: 1 })
  })

  const putRoast = async (body: Record<string, unknown>) => {
    const { PUT } = await import('@/app/api/roast-batches/[id]/route')
    return PUT(request('/api/roast-batches/roast-1', 'PUT', body), routeParams)
  }
  const updatedData = () => mockPrisma.roastBatch.updateMany.mock.calls[0][0].data

  test('a picked day is stored at 12:00 UTC, not 00:00 UTC', async () => {
    mockAuthUser = roaster

    const response = await putRoast({ roastDate: '2026-09-18' })

    expect(response.status).toBe(200)
    expect(updatedData().roastDate).toEqual(noon('2026-09-18'))
  })

  test('the Thai today is accepted at 00:30 Thai time', async () => {
    mockAuthUser = roaster
    at('2026-10-04T17:30:00.000Z')

    const response = await putRoast({ roastDate: '2026-10-05' })

    expect(response.status).toBe(200)
    expect(updatedData().roastDate).toEqual(noon('2026-10-05'))
  })

  test('a day that does not exist is refused', async () => {
    mockAuthUser = roaster

    const response = await putRoast({ roastDate: '2026-02-30' })

    expect(response.status).toBe(400)
    expect(mockPrisma.roastBatch.updateMany).not.toHaveBeenCalled()
  })

  test('leaving the date out does not touch the stored roast date', async () => {
    mockAuthUser = roaster

    const response = await putRoast({ roastLevel: 'Dark' })

    expect(response.status).toBe(200)
    expect(updatedData()).not.toHaveProperty('roastDate')
  })
})

describe('POST /api/processing-batches/[id]/drying-logs stores the day at 12:00 UTC', () => {
  const routeParams = { params: Promise.resolve({ id: 'batch-1' }) }
  const reading = { moistureContent: 12.5, ambientTemp: 28, relativeHumidity: 70 }

  beforeEach(() => {
    mockPrisma.processingBatch.findUnique.mockResolvedValue({ createdById: 'processor-1' })
    // A new reading also moves the batch's updatedAt (drying-logs.test.ts).
    mockPrisma.processingBatch.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.dryingLogEntry.create.mockImplementation(async ({ data }: any) => ({ id: 'log-1', ...data }))
  })

  const postLog = async (date: unknown) => {
    const { POST } = await import('@/app/api/processing-batches/[id]/drying-logs/route')
    return POST(
      request('/api/processing-batches/batch-1/drying-logs', 'POST', { date, ...reading }),
      routeParams,
    )
  }

  test('a picked YYYY-MM-DD is stored at 12:00 UTC', async () => {
    mockAuthUser = processor

    const response = await postLog('2026-10-05')

    expect(response.status).toBe(201)
    expect(mockPrisma.dryingLogEntry.create.mock.calls[0][0].data.date).toEqual(noon('2026-10-05'))
  })

  test('a full ISO datetime is kept as that instant', async () => {
    mockAuthUser = processor

    const response = await postLog('2026-10-05T03:15:00.000Z')

    expect(response.status).toBe(201)
    expect(mockPrisma.dryingLogEntry.create.mock.calls[0][0].data.date).toEqual(
      new Date('2026-10-05T03:15:00.000Z'),
    )
  })

  test('a date that is not a date is a 400, not a 500', async () => {
    mockAuthUser = processor

    expect((await postLog('2026-02-30')).status).toBe(400)
    expect((await postLog('soon')).status).toBe(400)
    expect(mockPrisma.dryingLogEntry.create).not.toHaveBeenCalled()
  })
})

describe('GAP logs store the day at 12:00 UTC', () => {
  const routeParams = { params: Promise.resolve({ id: 'gap-1' }) }
  const newLog = {
    farmId: null,
    farmPlotLocation: 'Plot A',
    activityTypeId: 'activity-1',
    productUsed: 'Compost',
    quantity: '20 kg',
  }

  beforeEach(() => {
    mockPrisma.activityType.findUnique.mockResolvedValue({ id: 'activity-1', name: 'Fertilizing' })
    mockPrisma.gAPLogEntry.create.mockImplementation(async ({ data }: any) => ({ id: 'gap-1', ...data }))
    mockPrisma.gAPLogEntry.findUnique.mockResolvedValue({ farmId: null, createdBy: 'admin-1', farm: null })
    mockPrisma.gAPLogEntry.update.mockImplementation(async ({ data }: any) => ({ id: 'gap-1', ...data }))
  })

  const postGap = async (date: unknown) => {
    const { POST } = await import('@/app/api/gap-logs/route')
    return POST(request('/api/gap-logs', 'POST', { ...newLog, date }))
  }
  const putGap = async (body: Record<string, unknown>) => {
    const { PUT } = await import('@/app/api/gap-logs/[id]/route')
    return PUT(request('/api/gap-logs/gap-1', 'PUT', body), routeParams)
  }

  test('POST stores a picked YYYY-MM-DD at 12:00 UTC', async () => {
    mockAuthUser = admin

    const response = await postGap('2026-10-05')

    expect(response.status).toBe(201)
    expect(mockPrisma.gAPLogEntry.create.mock.calls[0][0].data.date).toEqual(noon('2026-10-05'))
  })

  test('POST refuses a day that does not exist', async () => {
    mockAuthUser = admin

    const response = await postGap('2026-02-30')

    expect(response.status).toBe(400)
    expect(mockPrisma.gAPLogEntry.create).not.toHaveBeenCalled()
  })

  test('PUT stores an edited YYYY-MM-DD at 12:00 UTC', async () => {
    mockAuthUser = admin

    const response = await putGap({ date: '2026-10-04' })

    expect(response.status).toBe(200)
    expect(mockPrisma.gAPLogEntry.update.mock.calls[0][0].data.date).toEqual(noon('2026-10-04'))
  })

  test('PUT without a date leaves the stored date alone', async () => {
    mockAuthUser = admin

    const response = await putGap({ notes: 'Rain in the afternoon' })

    expect(response.status).toBe(200)
    expect(mockPrisma.gAPLogEntry.update.mock.calls[0][0].data).not.toHaveProperty('date')
  })

  test('PUT refuses a null or invalid date (it used to store 1970-01-01)', async () => {
    mockAuthUser = admin

    expect((await putGap({ date: null })).status).toBe(400)
    expect((await putGap({ date: '2026-13-01' })).status).toBe(400)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
  })
})
