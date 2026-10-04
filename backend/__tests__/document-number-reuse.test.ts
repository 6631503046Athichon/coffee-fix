/**
 * Document numbers are never handed out twice, not even after a delete.
 *
 * On production, deleting HL-2026-8 and then creating a lot gave HL-2026-8
 * again (the same for GBL-2026-8 and ORD-2026-0002): the number was the
 * highest one left in the table plus one. Printed labels and receipts with
 * one number then meant two different records. The numbers now come from a
 * persistent counter (lib/documentSequence, table "DocumentSequence") that
 * never goes back and never goes below the highest number in the table.
 *
 * These run the real routes and helpers against an in-memory database
 * (helpers/memoryPrisma), whose $queryRaw answers the counter statement.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { createMemoryPrisma } from './helpers/memoryPrisma'

const mockDb = createMemoryPrisma()

// The harvest lot routes write with single statements outside a transaction,
// so the client here can write too.
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  get default() {
    return { ...mockDb.tx, $transaction: mockDb.client.$transaction }
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

const farmer = { id: 'farmer-1', name: 'Farmer One', roles: ['Farmer'], isActive: true, isSuperAdmin: false }

const newLot = {
  farmerName: 'Somchai',
  cherryVariety: 'Catimor',
  weightKg: 150,
  farmPlotLocation: 'Plot B',
  harvestDate: '2025-12-01',
}

async function createHarvestLot() {
  const { POST } = await import('@/app/api/harvest-lots/route')
  const response = await POST(
    new NextRequest('http://localhost:3001/api/harvest-lots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(newLot),
    }),
  )
  return { status: response.status, data: await response.json() }
}

async function deleteHarvestLot(id: string) {
  const { DELETE } = await import('@/app/api/harvest-lots/[id]/route')
  const response = await DELETE(
    new NextRequest(`http://localhost:3001/api/harvest-lots/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) },
  )
  return { status: response.status, data: await response.json() }
}

beforeEach(() => {
  mockDb.reset()
  mockAuthUser = farmer
})

describe('harvest lots: a deleted lot keeps its number', () => {
  test('create HL -> delete it -> the next lot gets a NEW number', async () => {
    const { businessYear } = await import('@/lib/utils')
    const year = businessYear()

    const first = await createHarvestLot()
    expect(first.status).toBe(201)
    expect(first.data.harvestLot.displayId).toBe(`HL-${year}-1`)

    const removed = await deleteHarvestLot(first.data.harvestLot.id)
    expect(removed.status).toBe(200)
    expect(mockDb.rows('harvestLot')).toHaveLength(0)

    const second = await createHarvestLot()
    expect(second.status).toBe(201)
    expect(second.data.harvestLot.displayId).toBe(`HL-${year}-2`)
  })

  test('the production case: HL-8 deleted, the next lot is HL-9, not a second HL-8', async () => {
    const { businessYear } = await import('@/lib/utils')
    const year = businessYear()
    for (let n = 1; n <= 7; n++) {
      mockDb.seed('harvestLot', {
        id: `old-${n}`,
        displayId: `HL-${year}-${n}`,
        status: 'Complete',
        createdById: farmer.id,
        farmId: null,
      })
    }

    // No counter row yet (first lot after the deploy): it starts after HL-7.
    const eighth = await createHarvestLot()
    expect(eighth.data.harvestLot.displayId).toBe(`HL-${year}-8`)

    expect((await deleteHarvestLot(eighth.data.harvestLot.id)).status).toBe(200)

    const ninth = await createHarvestLot()
    expect(ninth.data.harvestLot.displayId).toBe(`HL-${year}-9`)
    expect(mockDb.rows('harvestLot').map(r => r.displayId)).not.toContain(`HL-${year}-8`)
    expect(mockDb.sequences()[`HL-${year}`]).toBe(9)
  })
})

describe('green bean lots (Hull & Grade block): numbers of deleted lots stay used', () => {
  test('a block reserved for one hull is not handed out again after its lots are deleted', async () => {
    const { nextDisplayIds, businessYear } = await import('@/lib/utils')
    const prisma = (await import('@/lib/prisma')).default as any
    const year = businessYear()

    const ids = await nextDisplayIds(prisma.greenBeanLot, 'GBL', 2)
    expect(ids).toEqual([`GBL-${year}-1`, `GBL-${year}-2`])
    ids.forEach((displayId, i) => mockDb.seed('greenBeanLot', { id: `gbl-${i}`, displayId }))

    await prisma.greenBeanLot.deleteMany({ where: { displayId: { in: ids } } })

    expect(await nextDisplayIds(prisma.greenBeanLot, 'GBL', 2)).toEqual([`GBL-${year}-3`, `GBL-${year}-4`])
  })

  test('numbers taken inside a transaction that rolls back are given back (nothing kept them)', async () => {
    const { nextDisplayId, businessYear } = await import('@/lib/utils')
    const prisma = (await import('@/lib/prisma')).default as any
    const year = businessYear()

    await expect(
      prisma.$transaction(async (tx: any) => {
        expect(await nextDisplayId(tx.greenBeanLot, 'GBL', tx)).toBe(`GBL-${year}-1`)
        throw new Error('rolled back')
      }),
    ).rejects.toThrow('rolled back')

    expect(await nextDisplayId(prisma.greenBeanLot, 'GBL')).toBe(`GBL-${year}-1`)
  })
})

describe('sale orders and invoices: a deleted number stays used', () => {
  test('ORD-2026-0002 deleted -> the next order is ORD-2026-0003', async () => {
    const { getNextSaleOrderNumber } = await import('@/lib/documentNumbers')
    mockDb.seed('saleOrder', { id: 'so-1', orderNumber: 'ORD-2026-0001' })

    const second = await getNextSaleOrderNumber(2026)
    expect(second).toBe('ORD-2026-0002')
    mockDb.seed('saleOrder', { id: 'so-2', orderNumber: second })
    mockDb.rows('saleOrder').splice(1, 1) // deleted

    expect(await getNextSaleOrderNumber(2026)).toBe('ORD-2026-0003')
  })

  test('a number taken inside a sale that fails is given back, so no gap is left', async () => {
    const { getNextSaleOrderNumber } = await import('@/lib/documentNumbers')
    const prisma = (await import('@/lib/prisma')).default as any

    await expect(
      prisma.$transaction(async (tx: any) => {
        expect(await getNextSaleOrderNumber(2026, tx)).toBe('ORD-2026-0001')
        throw Object.assign(new Error('stock changed'), { statusCode: 409 })
      }),
    ).rejects.toThrow('stock changed')

    const kept = await prisma.$transaction(async (tx: any) => {
      const orderNumber = await getNextSaleOrderNumber(2026, tx)
      await tx.saleOrder.create({ data: { orderNumber } })
      return orderNumber
    })
    expect(kept).toBe('ORD-2026-0001')
    expect(await getNextSaleOrderNumber(2026)).toBe('ORD-2026-0002')
  })

  test('invoices count on their own series, also past deletes', async () => {
    const { getNextInvoiceNumber, getNextSaleOrderNumber } = await import('@/lib/documentNumbers')

    expect(await getNextInvoiceNumber(2026)).toBe('INV-2026-0001')
    expect(await getNextInvoiceNumber(2026)).toBe('INV-2026-0002')
    expect(await getNextSaleOrderNumber(2026)).toBe('ORD-2026-0001')
    expect(mockDb.sequences()).toMatchObject({ 'INV-2026': 2, 'ORD-2026': 1 })
  })
})

describe('POST /api/backfill-display-ids takes its numbers from the counter too', () => {
  test('a legacy lot without a number does not get a deleted lot\'s number', async () => {
    mockAuthUser = { id: 'admin-1', name: 'Admin', roles: ['Admin'], isActive: true, isSuperAdmin: false }
    const createdAt = new Date(2026, 2, 1, 12) // local time, as the route reads the year
    mockDb.seed('harvestLot', { id: 'kept', displayId: 'HL-2026-3', createdAt })
    mockDb.seed('harvestLot', { id: 'legacy', displayId: null, createdAt })
    // HL-2026-4 and HL-2026-5 were handed out and their lots deleted.
    mockDb.sequences()['HL-2026'] = 5

    const { POST } = await import('@/app/api/backfill-display-ids/route')
    const response = await POST(
      new NextRequest('http://localhost:3001/api/backfill-display-ids', { method: 'POST' }),
    )

    expect(response.status).toBe(200)
    expect(mockDb.get('harvestLot', 'legacy')?.displayId).toBe('HL-2026-6')
  })

  test('a dry run takes no numbers', async () => {
    mockAuthUser = { id: 'admin-1', name: 'Admin', roles: ['Admin'], isActive: true, isSuperAdmin: false }
    mockDb.seed('harvestLot', { id: 'legacy', displayId: null, createdAt: new Date(2026, 2, 1, 12) })

    const { POST } = await import('@/app/api/backfill-display-ids/route')
    const response = await POST(
      new NextRequest('http://localhost:3001/api/backfill-display-ids?dryRun=true', { method: 'POST' }),
    )

    expect(response.status).toBe(200)
    expect(mockDb.get('harvestLot', 'legacy')?.displayId).toBeNull()
    expect(mockDb.sequences()).toEqual({})
  })
})
