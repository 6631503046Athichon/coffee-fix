/**
 * DELETE /api/farms/:id refuses a farm that still has harvest lots, GAP logs
 * or soil analyses (409 with the counts). Deleting the farm would clear it
 * from its lots and GAP logs, so they drop out of the owner's views, and
 * would delete its soil analyses with it. The client used to decide this by
 * matching lots on location text, so after a location edit nothing stopped
 * the delete. Weather records, fetched or typed in, are deleted with the
 * farm as before.
 *
 * The count and the delete run in one transaction that first locks the farm
 * row (SELECT ... FOR UPDATE). Under READ COMMITTED a conditional delete
 * alone does not see a lot whose insert is still in flight, and the lot
 * would lose its farm once both commit; the lock makes the delete wait for
 * that insert, so the count sees it.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARM_ID = 'farm-1'
const OWNER = 'farmer-a'

const owner = { id: OWNER, roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const collaborator = { id: 'farmhand-1', roles: ['Farmer'], isActive: true, isSuperAdmin: false }
const admin = { id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false }
const superAdmin = { id: 'super-1', roles: [], isActive: true, isSuperAdmin: true }

type Counts = { harvestLots: number; gapLogs: number; soilAnalyses: number; manualWeather: number; apiWeather: number }

// What the database holds for the farm.
let farmExists: boolean
let counts: Counts
// A write in flight when the delete starts: it holds a key-share lock on the
// farm row, so it commits before the delete's FOR UPDATE is granted.
let inFlightWrite: Partial<Counts> | null
// The farm is gone by the time the transaction locks it (deleted elsewhere).
let deletedBeforeLock: boolean
// Order of the database calls, to check the lock comes before the counts.
let calls: string[]

const logged = <T extends (...args: any[]) => any>(name: string, fn: T) =>
  jest.fn((...args: Parameters<T>) => {
    calls.push(name)
    return fn(...args)
  })

const mockPrisma: any = {
  farm: {
    findUnique: jest.fn(async () => (farmExists ? { id: FARM_ID, ownerId: OWNER } : null)),
    delete: logged('farm.delete', async () => {
      farmExists = false
      return { id: FARM_ID }
    }),
    deleteMany: jest.fn(),
  },
  harvestLot: { count: logged('harvestLot.count', async () => counts.harvestLots) },
  gAPLogEntry: { count: logged('gAPLogEntry.count', async () => counts.gapLogs) },
  soilAnalysis: { count: logged('soilAnalysis.count', async () => counts.soilAnalyses) },
  weatherRecord: {
    count: jest.fn(),
    deleteMany: logged('weatherRecord.deleteMany', async (args: any) => {
      if (args.where.farmId !== FARM_ID) return { count: 0 }
      const deleted = counts.manualWeather + counts.apiWeather
      counts = { ...counts, manualWeather: 0, apiWeather: 0 }
      return { count: deleted }
    }),
  },
  $queryRaw: logged('$queryRaw', async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (deletedBeforeLock) farmExists = false
    if (inFlightWrite) {
      counts = { ...counts, ...inFlightWrite }
      inFlightWrite = null
    }
    return farmExists && values[0] === FARM_ID ? [{ id: FARM_ID }] : []
  }),
  $transaction: jest.fn(async (fn: any) => {
    calls.push('$transaction')
    if (typeof fn !== 'function') throw new Error('expected an interactive transaction')
    return fn(mockPrisma)
  }),
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
  handleApiError: jest.fn((error: any) => {
    const status = error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

async function deleteFarm() {
  const { DELETE } = await import('@/app/api/farms/[id]/route')
  const response = await DELETE(
    new NextRequest(`http://localhost:3001/api/farms/${FARM_ID}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: FARM_ID }) },
  )
  return { status: response.status, data: await response.json() }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = owner
  farmExists = true
  counts = { harvestLots: 0, gapLogs: 0, soilAnalyses: 0, manualWeather: 0, apiWeather: 0 }
  inFlightWrite = null
  deletedBeforeLock = false
  calls = []
})

describe('DELETE /api/farms/:id with records linked to the farm', () => {
  test.each([
    ['harvest lots', { harvestLots: 2 }, { harvestLots: 2, gapLogs: 0, soilAnalyses: 0 }],
    ['GAP logs', { gapLogs: 3 }, { harvestLots: 0, gapLogs: 3, soilAnalyses: 0 }],
    ['soil analyses', { soilAnalyses: 1 }, { harvestLots: 0, gapLogs: 0, soilAnalyses: 1 }],
  ])('refuses a farm with %s and lists what is linked', async (_label, linked, dependents) => {
    counts = { ...counts, ...linked, manualWeather: 2, apiWeather: 5 }

    const { status, data } = await deleteFarm()

    expect(status).toBe(409)
    expect(data.error).toMatch(/still has records linked to it/)
    expect(data.dependents).toEqual(dependents)
    expect(farmExists).toBe(true)
    expect(mockPrisma.farm.delete).not.toHaveBeenCalled()
    expect(mockPrisma.weatherRecord.deleteMany).not.toHaveBeenCalled()
    // The refused delete keeps the weather too.
    expect(counts).toMatchObject({ manualWeather: 2, apiWeather: 5 })
  })

  test('counts every record type by farmId, not by location text', async () => {
    counts = { ...counts, harvestLots: 1 }
    await deleteFarm()

    expect(mockPrisma.harvestLot.count).toHaveBeenCalledWith({ where: { farmId: FARM_ID } })
    expect(mockPrisma.gAPLogEntry.count).toHaveBeenCalledWith({ where: { farmId: FARM_ID } })
    expect(mockPrisma.soilAnalysis.count).toHaveBeenCalledWith({ where: { farmId: FARM_ID } })
  })

  test.each([
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ])('%s gets the same 409: there is no bypass', async (_label, user) => {
    mockAuthUser = user
    counts = { ...counts, harvestLots: 1, gapLogs: 1 }

    const { status, data } = await deleteFarm()

    expect(status).toBe(409)
    expect(data.dependents).toMatchObject({ harvestLots: 1, gapLogs: 1 })
    expect(farmExists).toBe(true)
  })

  test('locks the farm row first, then counts and deletes inside the same transaction', async () => {
    await deleteFarm()

    const lock = mockPrisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray
    expect(lock.join('?')).toMatch(/SELECT "id" FROM "Farm" WHERE "id" = \? FOR UPDATE/)
    expect(mockPrisma.$queryRaw.mock.calls[0][1]).toBe(FARM_ID)
    expect(calls).toEqual([
      '$transaction', '$queryRaw',
      'harvestLot.count', 'gAPLogEntry.count', 'soilAnalysis.count',
      'weatherRecord.deleteMany', 'farm.delete',
    ])
  })

  test('a lot whose insert was in flight when the delete started stops it and comes back in the counts', async () => {
    inFlightWrite = { harvestLots: 1 }

    const { status, data } = await deleteFarm()

    expect(status).toBe(409)
    expect(data.dependents).toMatchObject({ harvestLots: 1 })
    expect(farmExists).toBe(true)
    expect(mockPrisma.farm.delete).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/farms/:id with nothing linked', () => {
  test.each([
    ['owner', owner],
    ['Admin', admin],
  ])('the %s deletes the farm with all its weather, fetched or typed in', async (_label, user) => {
    mockAuthUser = user
    counts = { ...counts, apiWeather: 120, manualWeather: 40 }

    const { status, data } = await deleteFarm()

    expect(status).toBe(200)
    expect(data.message).toBe('Farm deleted successfully')
    expect(farmExists).toBe(false)
    expect(counts).toMatchObject({ apiWeather: 0, manualWeather: 0 })
    expect(mockPrisma.weatherRecord.deleteMany).toHaveBeenCalledWith({ where: { farmId: FARM_ID } })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  test('hand-entered weather does not block the delete', async () => {
    counts = { ...counts, manualWeather: 365 }

    const { status } = await deleteFarm()

    expect(status).toBe(200)
    expect(farmExists).toBe(false)
  })

  test('a collaborator cannot delete the farm', async () => {
    mockAuthUser = collaborator

    const { status } = await deleteFarm()

    expect(status).toBe(403)
    expect(farmExists).toBe(true)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('a missing farm is a 404', async () => {
    farmExists = false

    const { status } = await deleteFarm()

    expect(status).toBe(404)
  })

  test('a farm deleted elsewhere before the lock is a 404, not a second delete', async () => {
    deletedBeforeLock = true

    const { status } = await deleteFarm()

    expect(status).toBe(404)
    expect(mockPrisma.farm.delete).not.toHaveBeenCalled()
  })
})
