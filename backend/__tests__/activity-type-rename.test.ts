/**
 * F36: PUT /api/activity-types/:id renames the type and, in the same
 * transaction, the copy of its name every GAP log of that type keeps
 * (GAPLogEntry.activityTypeName). The GAP pages show, filter and edit logs
 * by that name, so a stale copy dropped older logs out of the filters and
 * made editing them fail with "not found".
 *
 * Writes live only on `mockTx`, the transaction client, so a write that
 * escaped the transaction would hit an undefined function and fail the test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const TYPE_ID = '7d3c1f2e-5a4b-4c6d-8e9f-0a1b2c3d4e5f'
const OTHER_TYPE_ID = '8e4d2a3f-6b5c-4d7e-9f0a-1b2c3d4e5f60'

type Row = Record<string, any>
let mockTypes: Row[] = []
let mockLogs: Row[] = []

const mockTx: any = {
  activityType: {
    update: jest.fn(async ({ where, data }: any) => {
      const row = mockTypes.find(t => t.id === where.id)
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
      Object.assign(row, data)
      return { ...row }
    }),
  },
  gAPLogEntry: {
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = mockLogs.filter(
        log =>
          log.activityTypeId === where.activityTypeId &&
          (where.activityTypeName?.not === undefined || log.activityTypeName !== where.activityTypeName.not),
      )
      hit.forEach(log => Object.assign(log, data))
      return { count: hit.length }
    }),
  },
}

const mockPrisma: any = {
  $transaction: jest.fn(async (callback: any) => callback(mockTx)),
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
      error.message === 'Unauthorized'
        ? 401
        : error.message === 'Insufficient permissions'
          ? 403
          : error.code === 'P2025'
            ? 404
            : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isSuperAdmin: true }
const farmer = { id: 'farmer-1', roles: ['Farmer'], isSuperAdmin: false }

const put = async (id: string, body: unknown) => {
  const { PUT } = await import('@/app/api/activity-types/[id]/route')
  return PUT(
    new NextRequest(`http://localhost:3001/api/activity-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

const namesOf = (typeId: string) =>
  mockLogs.filter(log => log.activityTypeId === typeId).map(log => log.activityTypeName)

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = admin
  mockTypes = [
    { id: TYPE_ID, name: 'Fertilizing', description: null, isActive: true },
    { id: OTHER_TYPE_ID, name: 'Pruning', description: null, isActive: true },
  ]
  mockLogs = [
    { id: 'g-1', activityTypeId: TYPE_ID, activityTypeName: 'Fertilizing' },
    { id: 'g-2', activityTypeId: TYPE_ID, activityTypeName: 'Fertilizing' },
    { id: 'g-3', activityTypeId: OTHER_TYPE_ID, activityTypeName: 'Pruning' },
  ]
})

describe('renaming an activity type', () => {
  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s renaming it moves its GAP logs to the new name', async (_who, user) => {
    mockAuthUser = user
    const response = await put(TYPE_ID, { name: 'Fertilising' })
    expect(response.status).toBe(200)
    expect((await response.json()).activityType.name).toBe('Fertilising')
    expect(namesOf(TYPE_ID)).toEqual(['Fertilising', 'Fertilising'])
    // Another type's logs are not touched.
    expect(namesOf(OTHER_TYPE_ID)).toEqual(['Pruning'])
    // Both writes ran in the one transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockTx.gAPLogEntry.updateMany).toHaveBeenCalledWith({
      where: { activityTypeId: TYPE_ID, activityTypeName: { not: 'Fertilising' } },
      data: { activityTypeName: 'Fertilising' },
    })
  })

  test('a log left with an older name by an earlier rename follows too', async () => {
    mockLogs.push({ id: 'g-4', activityTypeId: TYPE_ID, activityTypeName: 'Fertiliser' })
    expect((await put(TYPE_ID, { name: 'Fertilising' })).status).toBe(200)
    expect(namesOf(TYPE_ID)).toEqual(['Fertilising', 'Fertilising', 'Fertilising'])
  })

  test('changing only the description or the active flag leaves the logs alone', async () => {
    const response = await put(TYPE_ID, { description: 'Compost and manure', isActive: false })
    expect(response.status).toBe(200)
    expect(mockTx.gAPLogEntry.updateMany).not.toHaveBeenCalled()
    expect(namesOf(TYPE_ID)).toEqual(['Fertilizing', 'Fertilizing'])
  })

  test('404 for an unknown type, with no log renamed', async () => {
    const response = await put('9f5e3b4a-7c6d-4e8f-a01b-2c3d4e5f6071', { name: 'Fertilising' })
    expect(response.status).toBe(404)
    expect(mockTx.gAPLogEntry.updateMany).not.toHaveBeenCalled()
    expect(namesOf(TYPE_ID)).toEqual(['Fertilizing', 'Fertilizing'])
  })

  test('403 for a non-Admin, with nothing written', async () => {
    mockAuthUser = farmer
    const response = await put(TYPE_ID, { name: 'Fertilising' })
    expect(response.status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockTypes[0].name).toBe('Fertilizing')
    expect(namesOf(TYPE_ID)).toEqual(['Fertilizing', 'Fertilizing'])
  })
})
