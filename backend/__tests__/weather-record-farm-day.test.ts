/**
 * F35: POST /api/weather-records refuses records dated before the farm
 * existed, comparing Thai calendar days. The app sends recordDate as a plain
 * YYYY-MM-DD (stored at 00:00 UTC, 07:00 in Thailand), so comparing instants
 * refused a record for the farm's own first day whenever the farm was
 * created after 07:00 Thai time.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARMER = '550e8400-e29b-41d4-a716-4466554400a1'
const FARM = '0b6f4c8e-3d2a-4f1b-9c7e-1a2b3c4d5e6f'

let mockFarmCreatedAt = new Date()

const mockPrisma: any = {
  farm: {
    findUnique: jest.fn(async () => ({
      ownerId: FARMER,
      collaborators: [],
      createdAt: mockFarmCreatedAt,
    })),
  },
  weatherRecord: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async ({ data }: any) => ({ id: 'w-1', ...data })),
  },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

const farmer = { id: FARMER, roles: ['Farmer'], isSuperAdmin: false }

jest.mock('@/lib/middleware', () => ({
  requireAuth: jest.fn(async () => farmer),
  requireRole: jest.fn((user: any, roles: string[]) => {
    if (!user.isSuperAdmin && !user.roles.some((role: string) => roles.includes(role))) {
      throw new Error('Insufficient permissions')
    }
  }),
  handleApiError: jest.fn((error: any) => {
    const status = error.message === 'Insufficient permissions' ? 403 : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const post = async (recordDate: string) => {
  const { POST } = await import('@/app/api/weather-records/route')
  return POST(
    new NextRequest('http://localhost:3001/api/weather-records', {
      method: 'POST',
      body: JSON.stringify({
        farmId: FARM,
        farmPlotLocation: 'Plot 1',
        recordDate,
        temperatureMin: 18,
        temperatureMax: 29,
        temperatureAvg: 23,
        rainfall: 4,
        humidity: 80,
        source: 'Manual',
      }),
    }),
  )
}

const RANGE_ERROR = 'recordDate must be between the farm creation date and one day from now'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('weather record on the farm creation day', () => {
  test('a farm created at 10:00 Thai time takes weather for that same day', async () => {
    mockFarmCreatedAt = new Date('2026-03-10T03:00:00.000Z') // 10:00 on 10 March in Thailand
    const response = await post('2026-03-10')
    expect(response.status).toBe(201)
    expect(mockPrisma.weatherRecord.create).toHaveBeenCalledTimes(1)
  })

  test('the day before the farm was created is still refused', async () => {
    mockFarmCreatedAt = new Date('2026-03-10T03:00:00.000Z')
    const response = await post('2026-03-09')
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(RANGE_ERROR)
    expect(mockPrisma.weatherRecord.create).not.toHaveBeenCalled()
  })

  test('a farm created at 00:30 Thai time (still the day before in UTC) refuses that UTC day', async () => {
    mockFarmCreatedAt = new Date('2026-03-09T17:30:00.000Z') // 00:30 on 10 March in Thailand
    expect((await post('2026-03-09')).status).toBe(400)
    expect((await post('2026-03-10')).status).toBe(201)
  })

  test('a full datetime counts as its Thai day', async () => {
    mockFarmCreatedAt = new Date('2026-03-10T03:00:00.000Z')
    // 00:00 on 10 March in Thailand: the creation day, earlier than the farm.
    expect((await post('2026-03-09T17:00:00.000Z')).status).toBe(201)
    // 23:59 on 9 March in Thailand: the day before.
    expect((await post('2026-03-09T16:59:00.000Z')).status).toBe(400)
  })

  test.each(['0999-06-01', '0500-01-01'])('a year below 1000 (%s) is refused, not let through', async (recordDate) => {
    // Its Thai day comes out as an invalid date; the check must fail closed.
    mockFarmCreatedAt = new Date('2026-03-10T03:00:00.000Z')
    const response = await post(recordDate)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(RANGE_ERROR)
    expect(mockPrisma.weatherRecord.create).not.toHaveBeenCalled()
  })

  test('the upper bound (one day from now) is unchanged', async () => {
    mockFarmCreatedAt = new Date('2026-03-10T03:00:00.000Z')
    const farAhead = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const response = await post(farAhead)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(RANGE_ERROR)
  })
})
