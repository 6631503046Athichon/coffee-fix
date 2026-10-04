/**
 * Who may edit a customer in the shared address book (owner decision D3):
 * Processors pick and add customers in the Withdraw Stock popup, so they may
 * also correct one. Admin and Roaster edit as before; deleting stays with
 * Admin and Roaster.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  customer: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  saleOrder: { count: jest.fn() },
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
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized' ? 401 : error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const processor = { id: 'processor-1', roles: ['Processor'], isSuperAdmin: false }
const roaster = { id: 'roaster-1', roles: ['Roaster'], isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isSuperAdmin: true }
const farmerProcessor = { id: 'fp-1', roles: ['Farmer', 'Processor'], isSuperAdmin: false }
const farmer = { id: 'farmer-1', roles: ['Farmer'], isSuperAdmin: false }
const cupper = { id: 'cupper-1', roles: ['Cupper'], isSuperAdmin: false }

const CUSTOMER = 'c0a80121-7ac0-4e1c-9f3b-1a2b3c4d5e6f'

const request = (init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost:3001/api/customers/${CUSTOMER}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
const params = () => ({ params: Promise.resolve({ id: CUSTOMER }) })
const edit = () =>
  request({
    method: 'PUT',
    body: JSON.stringify({ name: '  Cafe Doi Roastery ', address: ' 99 Nimman Rd ' }),
  })

describe('PUT /api/customers/:id roles', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockPrisma.customer.findUnique.mockResolvedValue({ id: CUSTOMER })
    mockPrisma.customer.update.mockImplementation(async ({ data }: any) => ({
      id: CUSTOMER,
      type: 'Retailer',
      ...data,
    }))
    mockPrisma.saleOrder.count.mockResolvedValue(0)
    mockPrisma.customer.delete.mockResolvedValue({ id: CUSTOMER })
  })

  test.each([
    ['Processor', processor],
    ['Farmer+Processor', farmerProcessor],
    ['Roaster', roaster],
    ['Admin', admin],
    ['super admin', superAdmin],
  ])('a %s may edit a customer', async (_label, user) => {
    mockAuthUser = user
    const { PUT } = await import('@/app/api/customers/[id]/route')
    const response = await PUT(edit(), params())
    expect(response.status).toBe(200)
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: CUSTOMER },
      data: { name: 'Cafe Doi Roastery', address: '99 Nimman Rd' },
    })
    expect((await response.json()).customer).toMatchObject({ id: CUSTOMER, name: 'Cafe Doi Roastery' })
  })

  test('a Processor editing a missing customer gets 404', async () => {
    mockAuthUser = processor
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null)
    const { PUT } = await import('@/app/api/customers/[id]/route')
    const response = await PUT(edit(), params())
    expect(response.status).toBe(404)
    expect(mockPrisma.customer.update).not.toHaveBeenCalled()
  })

  test.each([
    ['Farmer', farmer],
    ['Cupper', cupper],
  ])('403 for a %s', async (_label, user) => {
    mockAuthUser = user
    const { PUT } = await import('@/app/api/customers/[id]/route')
    const response = await PUT(edit(), params())
    expect(response.status).toBe(403)
    expect(mockPrisma.customer.update).not.toHaveBeenCalled()
  })

  test('401 when signed out', async () => {
    const { PUT } = await import('@/app/api/customers/[id]/route')
    const response = await PUT(edit(), params())
    expect(response.status).toBe(401)
    expect(mockPrisma.customer.update).not.toHaveBeenCalled()
  })

  test('a Processor still cannot delete a customer', async () => {
    mockAuthUser = processor
    const { DELETE } = await import('@/app/api/customers/[id]/route')
    const response = await DELETE(request({ method: 'DELETE' }), params())
    expect(response.status).toBe(403)
    expect(mockPrisma.saleOrder.count).not.toHaveBeenCalled()
    expect(mockPrisma.customer.delete).not.toHaveBeenCalled()
  })

  test('a Processor still cannot read one customer', async () => {
    mockAuthUser = processor
    const { GET } = await import('@/app/api/customers/[id]/route')
    const response = await GET(request(), params())
    expect(response.status).toBe(403)
    expect(mockPrisma.customer.findUnique).not.toHaveBeenCalled()
  })
})
