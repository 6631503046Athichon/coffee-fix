/**
 * F33: POST /api/green-bean-lots/:id/withdrawals and
 * POST /api/parchment-lots/:id/withdrawals took the sale fields as sent. A
 * negative or zero price, a price with three decimals or "150abc" (read as
 * 150) went into the sale and its total, any currency string was stored, and
 * a field of the wrong type reached the database and came back as a 500.
 * The routes now check the body with the withdrawal schemas
 * (lib/validations): a Sale's price is above 0 with at most 2 decimals, the
 * currency is a known one, and a wrong type is a 400 with nothing written.
 * The rules match the PATCH that corrects a sale afterwards.
 *
 * The parchment POST also takes invoiceNumber now, like the green-bean one
 * (the column exists since prisma/sql/005).
 *
 * A customer name may be as long as the customer address book allows (200),
 * since the Workbench copies the picked customer's name in. A withdrawal that
 * loses the race for the last kg to another one is a 409 with the reason; the
 * generic 500 for unexpected errors (audit F28) had swallowed it.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockTx: any = {
  greenBeanLot: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  greenBeanWithdrawal: { create: jest.fn() },
  roasterInventoryItem: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  parchmentLot: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  parchmentWithdrawal: { create: jest.fn() },
  pricingHistory: { create: jest.fn() },
}

const mockPrisma: any = {
  greenBeanLot: { findUnique: jest.fn(), findMany: jest.fn() },
  parchmentLot: { findUnique: jest.fn() },
  roasterInventoryItem: { findFirst: jest.fn() },
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

const processor = {
  id: 'processor-1', email: null, username: null, name: 'Processor One',
  roles: ['Processor'], isActive: true, isSuperAdmin: false,
}

type Route = 'green' | 'parchment'

const post = async (route: Route, body: unknown, raw?: string) => {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  }
  if (route === 'green') {
    const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')
    return POST(new NextRequest('http://localhost:3001/api/green-bean-lots/gbl-1/withdrawals', init), {
      params: Promise.resolve({ id: 'gbl-1' }),
    })
  }
  const { POST } = await import('@/app/api/parchment-lots/[id]/withdrawals/route')
  return POST(new NextRequest('http://localhost:3001/api/parchment-lots/pl-1/withdrawals', init), {
    params: Promise.resolve({ id: 'pl-1' }),
  })
}

const created = (route: Route) =>
  (route === 'green' ? mockTx.greenBeanWithdrawal : mockTx.parchmentWithdrawal).create.mock.calls[0][0].data

const expectNothingWritten = () => {
  expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  expect(mockTx.greenBeanLot.updateMany).not.toHaveBeenCalled()
  expect(mockTx.parchmentLot.updateMany).not.toHaveBeenCalled()
  expect(mockTx.greenBeanWithdrawal.create).not.toHaveBeenCalled()
  expect(mockTx.parchmentWithdrawal.create).not.toHaveBeenCalled()
}

const sale = (fields: Record<string, unknown> = {}) => ({
  amountKg: 10,
  withdrawalType: 'Sale',
  purpose: 'Customer order',
  ...fields,
})

const routes: Route[] = ['green', 'parchment']

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = processor
  // The processor's own lots, 100 kg each.
  mockPrisma.greenBeanLot.findUnique.mockImplementation(async (args: any) =>
    args.include?.withdrawalHistory
      ? { id: 'gbl-1', currentWeightKg: 90, withdrawalHistory: [] }
      : { id: 'gbl-1', currentWeightKg: 100, availabilityStatus: 'Available', createdById: 'processor-1' })
  mockPrisma.parchmentLot.findUnique.mockImplementation(async (args: any) =>
    args.include?.processingBatch
      ? { id: 'pl-1', currentWeightKg: 100, processingBatch: { createdById: 'processor-1' } }
      : { id: 'pl-1', currentWeightKg: 90, withdrawalHistory: [] })
  mockPrisma.user.findUnique.mockResolvedValue({ roles: ['Roaster'], isActive: true })
  mockPrisma.roasterInventoryItem.findFirst.mockResolvedValue({ id: 'inv-1' })
  mockTx.greenBeanLot.updateMany.mockResolvedValue({ count: 1 })
  mockTx.greenBeanLot.findUnique.mockResolvedValue({ currentWeightKg: 90 })
  mockTx.greenBeanLot.update.mockResolvedValue({})
  mockTx.greenBeanWithdrawal.create.mockResolvedValue({ id: 'gbw-1' })
  mockTx.roasterInventoryItem.findFirst.mockResolvedValue(null)
  mockTx.roasterInventoryItem.create.mockResolvedValue({ id: 'inv-1' })
  mockTx.parchmentLot.updateMany.mockResolvedValue({ count: 1 })
  mockTx.parchmentLot.findUnique.mockResolvedValue({ currentWeightKg: 90 })
  mockTx.parchmentLot.update.mockResolvedValue({})
  mockTx.parchmentWithdrawal.create.mockResolvedValue({ id: 'pw-1' })
})

describe.each(routes)('POST /api/%s withdrawals: the sale price', (route) => {
  test.each([
    ['a negative price', -150, 'Sale price must be a number greater than 0'],
    ['a price of 0', 0, 'Sale price must be a number greater than 0'],
    ['a price with 3 decimals', 10.555, 'Sale price must have at most 2 decimals'],
    ['a price with 3 decimals as text', '180.255', 'Sale price must have at most 2 decimals'],
    ['text that only starts with a number', '150abc', 'Sale price must be a number greater than 0'],
    ['true', true, 'Sale price must be a number greater than 0'],
    ['a list', [150], 'Sale price must be a number greater than 0'],
    ['an object', { amount: 150 }, 'Sale price must be a number greater than 0'],
  ])('400 for %s, and nothing is written', async (_label, salePrice, message) => {
    const response = await post(route, sale({ salePrice }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(message)
    expectNothingWritten()
  })

  test('a price to the satang is stored with its total', async () => {
    const response = await post(route, sale({ salePrice: 180.25, currency: 'THB' }))
    expect(response.status).toBe(201)
    expect(created(route)).toMatchObject({ salePrice: 180.25, currency: 'THB', totalAmount: 1802.5 })
  })

  test('a plain numeric string is read as the number', async () => {
    const response = await post(route, sale({ salePrice: '180.25' }))
    expect(response.status).toBe(201)
    expect(created(route)).toMatchObject({ salePrice: 180.25, totalAmount: 1802.5 })
  })

  test.each([
    ['left out', undefined],
    ['null', null],
    ['empty', ''],
  ])('a price %s means no price and no total', async (_label, salePrice) => {
    const response = await post(route, sale(salePrice === undefined ? {} : { salePrice }))
    expect(response.status).toBe(201)
    expect(created(route)).toMatchObject({ salePrice: null, totalAmount: null })
  })
})

describe.each(routes)('POST /api/%s withdrawals: the currency', (route) => {
  test.each([
    ['an unknown code', 'XYZ'],
    ['a number', 764],
  ])('400 for %s, and nothing is written', async (_label, currency) => {
    const response = await post(route, sale({ salePrice: 100, currency }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Currency must be one of THB, USD, EUR, JPY, CNY')
    expectNothingWritten()
  })

  test('a known code in any case is stored in capitals', async () => {
    const response = await post(route, sale({ salePrice: 100, currency: ' usd ' }))
    expect(response.status).toBe(201)
    expect(created(route).currency).toBe('USD')
  })

  test('an empty currency is stored as none', async () => {
    const response = await post(route, sale({ salePrice: 100, currency: '' }))
    expect(response.status).toBe(201)
    expect(created(route).currency).toBeNull()
  })
})

describe.each(routes)('POST /api/%s withdrawals: a wrong type is a 400, not a 500', (route) => {
  test.each([
    ['a purpose that is a number', { purpose: 123 }],
    ['an unknown withdrawal type', { withdrawalType: 'Gift' }],
    ['notes that are an object', { notes: { text: 'x' } }],
    ['a customer name that is a number', { customerName: 42 }],
    ['an invoice number that is a list', { invoiceNumber: ['INV-1'] }],
    ['a delivery address that is true', { deliveryAddress: true }],
    ['a purpose over 200 characters', { purpose: 'x'.repeat(201) }],
    ['a customer name over 200 characters', { customerName: 'x'.repeat(201) }],
    ['an invoice number over 50 characters', { invoiceNumber: 'x'.repeat(51) }],
  ])('400 for %s, and nothing is written', async (_label, fields) => {
    const response = await post(route, sale(fields))
    expect(response.status).toBe(400)
    expect(typeof (await response.json()).error).toBe('string')
    expectNothingWritten()
  })

  test.each([
    ['a body that is not JSON', 'amountKg=10'],
    ['a JSON list', '[{"amountKg":10}]'],
    ['JSON null', 'null'],
  ])('400 for %s', async (_label, raw) => {
    const response = await post(route, undefined, raw)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Request body must be a JSON object')
    expectNothingWritten()
  })

  test('a customer name of up to 200 characters, as the address book allows, is stored', async () => {
    // Customer.name takes 200 characters and the Workbench copies the picked
    // customer's name in as it is.
    const name = 'C'.repeat(150)
    const response = await post(route, sale({ salePrice: 100, customerName: name }))
    expect(response.status).toBe(201)
    expect(created(route).customerName).toBe(name)
    expect((await post(route, sale({ customerName: 'C'.repeat(200) }))).status).toBe(201)
  })

  test('a customer name over 200 characters says so', async () => {
    const response = await post(route, sale({ customerName: 'C'.repeat(201) }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Customer name must be 200 characters or fewer')
    expectNothingWritten()
  })

  test('the kg still come as a number or a numeric string, as before', async () => {
    const response = await post(route, sale({ amountKg: '10' }))
    expect(response.status).toBe(201)
    expect(created(route).amountKg).toBe(10)
  })
})

describe('POST /api/parchment-lots/:id/withdrawals: the invoice number', () => {
  test('is stored, like on a green-bean withdrawal', async () => {
    const response = await post('parchment', sale({ salePrice: 120, invoiceNumber: 'INV-2026-0042' }))
    expect(response.status).toBe(201)
    expect(created('parchment').invoiceNumber).toBe('INV-2026-0042')
  })

  test('left out is stored as none', async () => {
    const response = await post('parchment', sale())
    expect(response.status).toBe(201)
    expect(created('parchment').invoiceNumber).toBeNull()
  })

  test('the roast notes on a Roasting Stock withdrawal must be text', async () => {
    const response = await post('parchment', {
      amountKg: 10,
      withdrawalType: 'RoastingStock',
      purpose: 'Roasting',
      targetRoasterId: 'roaster-1',
      roastProfileNotes: 5,
    })
    expect(response.status).toBe(400)
    expectNothingWritten()
  })
})

describe('POST /api/green-bean-lots/:id/withdrawals: the green-bean invoice number', () => {
  test('is still stored', async () => {
    const response = await post('green', sale({ salePrice: 120, invoiceNumber: 'INV-2026-0043' }))
    expect(response.status).toBe(201)
    expect(created('green').invoiceNumber).toBe('INV-2026-0043')
  })
})

describe.each(routes)('POST /api/%s withdrawals: another withdrawal took the kg first', (route) => {
  test('409 with the reason, not a generic 500', async () => {
    // The up-front check passed, but the guarded decrement found less than
    // the amount left: a concurrent withdrawal won the race.
    const guard = route === 'green' ? mockTx.greenBeanLot.updateMany : mockTx.parchmentLot.updateMany
    guard.mockResolvedValue({ count: 0 })
    const response = await post(route, sale({ salePrice: 100 }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('Insufficient weight (concurrent withdrawal contention)')
    expect(mockTx.greenBeanWithdrawal.create).not.toHaveBeenCalled()
    expect(mockTx.parchmentWithdrawal.create).not.toHaveBeenCalled()
  })
})
