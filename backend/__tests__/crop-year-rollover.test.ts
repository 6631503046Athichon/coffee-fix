/**
 * F17: crop years never rolled over. ensureCropYears only ran from
 * GET /api/crop-years, which the frontend stopped calling, so from
 * 2027-10-01 no crop year would contain today and new lots would save
 * cropYearId = null. Bulk-load phase 1 (loaded by every logged-in session)
 * now adds the missing previous / current / next years, on the Thai date,
 * and an existing row's dates and description are never overwritten.
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  farm: { findMany: jest.fn(async () => []) },
  harvestLot: { findMany: jest.fn(async () => []) },
  cropYear: { findMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
  processType: { findMany: jest.fn(async () => []) },
  activityType: { findMany: jest.fn(async () => []) },
  coffeeGrade: { findMany: jest.fn(async () => []) },
  customer: { findMany: jest.fn(async () => []) },
  user: { findMany: jest.fn(async () => []) },
  soilAnalysis: { findMany: jest.fn(async () => []) },
  weatherRecord: { findMany: jest.fn(async () => []) },
  gAPLogEntry: { findMany: jest.fn(async () => []) },
  processingBatch: { findMany: jest.fn(async () => []) },
  parchmentLot: { findMany: jest.fn(async () => []) },
  greenBeanLot: { findMany: jest.fn(async () => []) },
  roasterInventoryItem: { findMany: jest.fn(async () => []) },
  roastBatch: { findMany: jest.fn(async () => []) },
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

const farmer = { id: 'farmer-1', roles: ['Farmer'], isSuperAdmin: false }

// A crop-year row as the database holds it.
const row = (year: string, description: string | null = null) => {
  const [start, end] = year.split('/')
  return {
    id: `cy-${start}`,
    year,
    startDate: new Date(`${start}-10-01`),
    endDate: new Date(`${end}-09-30`),
    description,
    _count: { harvestLots: 0, processingBatches: 0 },
  }
}

// The table: findMany lists it, upsert adds a year only when it is missing.
let table: ReturnType<typeof row>[] = []

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  table = []
  mockPrisma.cropYear.findMany.mockImplementation(async () =>
    [...table].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
  )
  mockPrisma.cropYear.upsert.mockImplementation(async (args: any) => {
    const existing = table.find(y => y.year === args.where.year)
    if (existing) {
      Object.assign(existing, args.update)
      return existing
    }
    const created = { ...row(args.create.year), ...args.create }
    table.push(created)
    return created
  })
  mockPrisma.cropYear.updateMany.mockImplementation(async (args: any) => {
    const matches = table.filter(y => y.id === args.where.id && y.description === args.where.description)
    for (const y of matches) Object.assign(y, args.data)
    return { count: matches.length }
  })
})

afterEach(() => {
  jest.useRealTimers()
})

// Freeze only the clock; promises and timers keep running for real.
const today = (iso: string) => {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask',
      'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
      'cancelIdleCallback', 'setImmediate', 'clearImmediate',
      'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  })
}

const bulkLoad = async (phase: 1 | 2) => {
  const { GET } = await import('@/app/api/bulk-load/route')
  const response = await GET(new NextRequest(`http://localhost:3001/api/bulk-load?phase=${phase}`))
  return { status: response.status, body: await response.json() }
}

describe('cropYearsAround reads the Thai calendar date', () => {
  test('23:59 on 30 September in Bangkok is still the 2026/2027 crop year', async () => {
    const { cropYearsAround } = await import('@/lib/cropYears')
    const years = cropYearsAround(new Date('2027-09-30T16:59:59Z'))
    expect(years.map(y => y.year)).toEqual(['2025/2026', '2026/2027', '2027/2028'])
  })

  test('00:00 on 1 October in Bangkok (still 30 September on UTC) is 2027/2028', async () => {
    const { cropYearsAround } = await import('@/lib/cropYears')
    const years = cropYearsAround(new Date('2027-09-30T17:00:00Z'))
    expect(years.map(y => y.year)).toEqual(['2026/2027', '2027/2028', '2028/2029'])
    expect(years[1]).toEqual({
      year: '2027/2028',
      startDate: new Date('2027-10-01T00:00:00Z'),
      endDate: new Date('2028-09-30T00:00:00Z'),
    })
  })

  test('mid-year (June) belongs to the crop year that started the October before', async () => {
    const { cropYearsAround } = await import('@/lib/cropYears')
    expect(cropYearsAround(new Date('2027-06-15T05:00:00Z'))[1].year).toBe('2026/2027')
  })
})

describe('ensureCropYears never overwrites an existing crop year', () => {
  test('an Admin-edited row keeps its dates and description; a new row gets a plain one', async () => {
    const edited = {
      ...row('2026/2027', 'Late rains, harvest ran into November'),
      endDate: new Date('2027-10-15T12:00:00Z'),
    }
    table = [edited]
    const { ensureCropYears } = await import('@/lib/cropYears')
    await ensureCropYears(new Date('2027-06-15T05:00:00Z'))

    expect(mockPrisma.cropYear.upsert).toHaveBeenCalledTimes(3)
    for (const [args] of mockPrisma.cropYear.upsert.mock.calls) {
      expect(args.update).toEqual({})
    }
    expect(table.find(y => y.year === '2026/2027')).toMatchObject({
      description: 'Late rains, harvest ran into November',
      endDate: new Date('2027-10-15T12:00:00Z'),
    })
    expect(table.find(y => y.year === '2027/2028')?.description).toBe('Crop year 2027/2028')
  })

  test('GET /api/crop-years leaves an edited description alone', async () => {
    table = [row('2026/2027', 'Edited by Admin')]
    mockAuthUser = farmer
    const { GET } = await import('@/app/api/crop-years/route')
    const response = await GET(new NextRequest('http://localhost:3001/api/crop-years'))
    expect(response.status).toBe(200)
    expect(table.find(y => y.year === '2026/2027')?.description).toBe('Edited by Admin')
  })
})

describe('bulk-load phase 1 rolls the crop years over', () => {
  test('on 1 October (Bangkok) it adds 2027/2028 and returns it, so a current year exists', async () => {
    // 00:30 on 1 October in Bangkok; the UTC date is still 30 September.
    today('2027-09-30T17:30:00Z')
    // What the old route left behind when the frontend last called it.
    table = [row('2024/2025'), row('2025/2026'), row('2026/2027')]
    mockAuthUser = farmer
    const { status, body } = await bulkLoad(1)

    expect(status).toBe(200)
    expect(body.cropYears.map((y: any) => y.year)).toEqual([
      '2028/2029', '2027/2028', '2026/2027', '2025/2026', '2024/2025',
    ])
    const created = mockPrisma.cropYear.upsert.mock.calls.map(([args]: any) => args.where.year)
    expect(created.sort()).toEqual(['2026/2027', '2027/2028', '2028/2029'])
  })

  test('with no crop years at all, the current one is created and listed', async () => {
    today('2027-10-02T03:00:00Z')
    mockAuthUser = farmer
    const { body } = await bulkLoad(1)
    const current = body.cropYears.find((y: any) => y.year === '2027/2028')
    expect(current).toBeDefined()
    const now = new Date()
    expect(new Date(current.startDate) <= now && now <= new Date(current.endDate)).toBe(true)
  })

  test('when all three years exist it writes nothing and lists them once', async () => {
    today('2027-06-15T05:00:00Z')
    table = [row('2025/2026', 'Edited'), row('2026/2027'), row('2027/2028')]
    mockAuthUser = farmer
    const { status, body } = await bulkLoad(1)
    expect(status).toBe(200)
    expect(body.cropYears).toHaveLength(3)
    expect(mockPrisma.cropYear.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.cropYear.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.cropYear.findMany).toHaveBeenCalledTimes(1)
  })

  test('does nothing for a caller who is not logged in', async () => {
    today('2027-10-02T03:00:00Z')
    const { status } = await bulkLoad(1)
    expect(status).toBe(401)
    expect(mockPrisma.cropYear.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.cropYear.findMany).not.toHaveBeenCalled()
  })

  test('a failed insert still loads phase 1 with the years already there', async () => {
    today('2027-10-02T03:00:00Z')
    table = [row('2026/2027')]
    mockPrisma.cropYear.upsert.mockRejectedValue(new Error('connection reset'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockAuthUser = farmer
    const { status, body } = await bulkLoad(1)
    expect(status).toBe(200)
    expect(body.cropYears.map((y: any) => y.year)).toEqual(['2026/2027'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('phase 2 does not touch crop years', async () => {
    today('2027-10-02T03:00:00Z')
    mockAuthUser = farmer
    const { status } = await bulkLoad(2)
    expect(status).toBe(200)
    expect(mockPrisma.cropYear.upsert).not.toHaveBeenCalled()
  })
})

describe('the old route\'s stale "Previous / Current / Next" labels are replaced', () => {
  // What the old route left when it last ran, while 2025/2026 was current.
  const legacyTable = () => [
    row('2024/2025', 'Previous crop year 2024/2025'),
    row('2025/2026', 'Current crop year 2025/2026'),
    row('2026/2027', 'Next crop year 2026/2027'),
  ]

  test('bulk-load phase 1 relabels them and lists the new labels, leaving the dates alone', async () => {
    today('2026-10-02T03:00:00Z')
    table = legacyTable()
    mockAuthUser = farmer
    const { status, body } = await bulkLoad(1)

    expect(status).toBe(200)
    const byYear = Object.fromEntries(body.cropYears.map((y: any) => [y.year, y]))
    expect(byYear['2026/2027'].description).toBe('Crop year 2026/2027')
    expect(byYear['2025/2026'].description).toBe('Crop year 2025/2026')
    expect(byYear['2024/2025'].description).toBe('Crop year 2024/2025')
    expect(byYear['2027/2028'].description).toBe('Crop year 2027/2028')
    expect(new Date(byYear['2026/2027'].startDate)).toEqual(new Date('2026-10-01T00:00:00Z'))
    expect(new Date(byYear['2026/2027'].endDate)).toEqual(new Date('2027-09-30T00:00:00Z'))
    for (const [args] of mockPrisma.cropYear.updateMany.mock.calls) {
      expect(Object.keys(args.data)).toEqual(['description'])
    }
  })

  test('with all three years present, only the stale label is written', async () => {
    today('2027-06-15T05:00:00Z')
    table = [
      row('2025/2026', 'Late rains, harvest ran into November'),
      row('2026/2027', 'Next crop year 2026/2027'),
      row('2027/2028'),
    ]
    mockAuthUser = farmer
    const { body } = await bulkLoad(1)

    expect(mockPrisma.cropYear.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.cropYear.updateMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.cropYear.updateMany).toHaveBeenCalledWith({
      where: { id: 'cy-2026', description: 'Next crop year 2026/2027' },
      data: { description: 'Crop year 2026/2027' },
    })
    expect(body.cropYears.map((y: any) => y.description)).toEqual([
      null, 'Crop year 2026/2027', 'Late rains, harvest ran into November',
    ])
  })

  test('a description that only looks like the old label is kept', async () => {
    today('2027-06-15T05:00:00Z')
    table = [
      row('2025/2026', 'Current crop year 2025/2026 (late rains)'),
      row('2026/2027', 'Next crop year 2027/2028'),
      row('2027/2028', 'current crop year 2027/2028'),
    ]
    mockAuthUser = farmer
    await bulkLoad(1)

    expect(mockPrisma.cropYear.updateMany).not.toHaveBeenCalled()
    expect(table.map(y => y.description)).toEqual([
      'Current crop year 2025/2026 (late rains)', 'Next crop year 2027/2028', 'current crop year 2027/2028',
    ])
  })

  test('an Admin edit made after the list was loaded is not overwritten', async () => {
    table = [row('2025/2026'), row('2026/2027'), row('2027/2028')]
    const loaded = table.map(y => ({ ...y, description: y.year === '2026/2027' ? 'Next crop year 2026/2027' : y.description }))
    // The row was edited between the load and the write.
    table[1].description = 'Edited by Admin'
    const { upkeepCropYears } = await import('@/lib/cropYears')

    await upkeepCropYears(loaded, new Date('2027-06-15T05:00:00Z'))

    expect(table[1].description).toBe('Edited by Admin')
  })

  test('GET /api/crop-years relabels them too', async () => {
    today('2026-10-02T03:00:00Z')
    table = legacyTable()
    mockAuthUser = farmer
    const { GET } = await import('@/app/api/crop-years/route')
    const response = await GET(new NextRequest('http://localhost:3001/api/crop-years'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.cropYears.find((y: any) => y.year === '2026/2027').description).toBe('Crop year 2026/2027')
  })
})
