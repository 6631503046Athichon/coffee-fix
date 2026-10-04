/**
 * F37: PUT /api/invoices/:id checked the invoice's creator, not the owner of
 * the sale it bills. An invoice an Admin issued on a Roaster's sale was
 * read-only for that Roaster, while GET already went by the sale. PUT now
 * goes by the sale too: the Roaster who recorded the sale, or an Admin.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  invoice: { findUnique: jest.fn(), update: jest.fn() },
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
const saleOwner = user('roaster-1', ['Roaster'])
const otherRoaster = user('roaster-2', ['Roaster'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const processor = user('processor-1', ['Processor'])

// An invoice on roaster-1's sale, issued by `createdBy`.
const invoiceBy = (createdBy: string) => ({
  id: 'invoice-1',
  createdBy,
  saleOrder: { createdBy: 'roaster-1' },
})

const put = async (body: Record<string, unknown> = { status: 'Paid' }) => {
  const { PUT } = await import('@/app/api/invoices/[id]/route')
  return PUT(
    new NextRequest('http://localhost:3001/api/invoices/invoice-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'invoice-1' }) },
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  mockPrisma.invoice.update.mockImplementation(async ({ data }: any) => ({ id: 'invoice-1', ...data }))
})

describe('PUT /api/invoices/:id', () => {
  test("the sale's Roaster updates an invoice an Admin issued on their sale", async () => {
    mockAuthUser = saleOwner
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('admin-1'))
    const response = await put({ status: 'Paid', notes: ' Paid by transfer ' })
    expect(response.status).toBe(200)
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invoice-1' },
      data: { status: 'Paid', notes: 'Paid by transfer' },
    }))
  })

  test("the sale's Roaster updates an invoice they issued themselves", async () => {
    mockAuthUser = saleOwner
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('roaster-1'))
    expect((await put()).status).toBe(200)
  })

  test("another Roaster cannot update an invoice on someone else's sale, even one they issued", async () => {
    mockAuthUser = otherRoaster
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('roaster-2'))
    expect((await put()).status).toBe(403)
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled()
  })

  test("another Roaster cannot update an Admin-issued invoice on someone else's sale", async () => {
    mockAuthUser = otherRoaster
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('admin-1'))
    expect((await put()).status).toBe(403)
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled()
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])("%s updates any Roaster's invoice", async (_label, viewer) => {
    mockAuthUser = viewer
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('roaster-1'))
    expect((await put()).status).toBe(200)
  })

  test('a Processor still cannot update invoices', async () => {
    mockAuthUser = processor
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('roaster-1'))
    expect((await put()).status).toBe(403)
    expect(mockPrisma.invoice.findUnique).not.toHaveBeenCalled()
  })

  test('reads the sale owner for the check', async () => {
    mockAuthUser = saleOwner
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceBy('admin-1'))
    await put()
    expect(mockPrisma.invoice.findUnique.mock.calls[0][0].select.saleOrder).toEqual({ select: { createdBy: true } })
  })

  test('an unknown invoice is 404', async () => {
    mockAuthUser = saleOwner
    mockPrisma.invoice.findUnique.mockResolvedValue(null)
    expect((await put()).status).toBe(404)
  })
})
