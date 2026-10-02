/**
 * Who sees and records a farm's soil, weather and GAP data, and who manages
 * the farm itself:
 * - Admins (super admins included, whatever their roles) see every farm
 * - everyone else sees only farms they own or collaborate on; a list asked
 *   for one farm (?farmId=) holds that farm's rows only, a farm that is not
 *   theirs is a 403, and a user with no farms gets no rows
 * - GET-by-id applies the same scope; having recorded a soil analysis or GAP
 *   log gives no access of its own once the user is off the farm (a removed
 *   farmhand, or the owner before a transfer), except on a legacy GAP log
 *   with no farm
 * - collaborators may create and edit soil, weather and GAP records on a
 *   shared farm; farm edit and delete stay with the owner and Admins
 * - a GAP log moves only onto a farm the caller may record on, and only off
 *   its farm for someone who may delete it there
 * - crop years: login required to list them, and a crop year's detail holds
 *   counts, not other farmers' lots and batches
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const FARMER_A = '550e8400-e29b-41d4-a716-4466554400a1'
const FARMER_B = '550e8400-e29b-41d4-a716-4466554400b1'
const FARMER_C = '550e8400-e29b-41d4-a716-4466554400c1' // collaborator on FARM_A
const FARMER_D = '550e8400-e29b-41d4-a716-4466554400d1' // no farms
const FARM_A = '0b6f4c8e-3d2a-4f1b-9c7e-1a2b3c4d5e6f'
const FARM_A2 = '1c7a5d9f-4e3b-4a2c-8d8f-2b3c4d5e6f70'
const FARM_B = '2d8b6e0a-5f4c-4b3d-9e9a-3c4d5e6f7081'
const FARM_C = '4fad8a2c-7b6e-4d5f-9abc-5e6f708192a3' // FARMER_C's own farm
const NO_SUCH_FARM = '3e9c7f1b-6a5d-4c4e-8fab-4d5e6f708192'

const user = (id: string, roles: string[], isSuperAdmin = false) => ({
  id, email: null, username: null, name: id, roles, isActive: true, isSuperAdmin,
})
const farmerA = user(FARMER_A, ['Farmer'])
const farmerB = user(FARMER_B, ['Farmer'])
const collaborator = user(FARMER_C, ['Farmer'])
const farmerNoFarms = user(FARMER_D, ['Farmer'])
const processor = user('processor-1', ['Processor'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const superAdminFarmer = user('super-2', ['Farmer'], true)

const FARMS: Record<string, { ownerId: string; collaborators: string[] }> = {
  [FARM_A]: { ownerId: FARMER_A, collaborators: [FARMER_C] },
  [FARM_A2]: { ownerId: FARMER_A, collaborators: [] },
  [FARM_B]: { ownerId: FARMER_B, collaborators: [] },
  [FARM_C]: { ownerId: FARMER_C, collaborators: [] },
}

// A farm as Prisma returns it; a select's collaborators.where narrows the
// collaborator rows, as it does in Prisma.
function farmView(id: string | null, args?: any) {
  const farm = id ? FARMS[id] : undefined
  if (!farm) return null
  const onlyUser = args?.select?.collaborators?.where?.userId
  return {
    id,
    farmName: `Farm ${id}`,
    location: 'Chiang Rai',
    ownerId: farm.ownerId,
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    collaborators: farm.collaborators
      .filter(userId => !onlyUser || userId === onlyUser)
      .map(userId => ({ userId, user: { id: userId, name: userId } })),
  }
}

type Row = { id: string; farmId: string | null; createdBy?: string | null; recordedBy?: string | null }
const WEATHER: Row[] = [
  { id: 'w-a', farmId: FARM_A, recordedBy: FARMER_A },
  { id: 'w-a2', farmId: FARM_A2, recordedBy: FARMER_A },
  { id: 'w-b', farmId: FARM_B, recordedBy: FARMER_B },
]
const SOIL: Row[] = [
  { id: 's-a', farmId: FARM_A, createdBy: FARMER_A },
  { id: 's-a2', farmId: FARM_A2, createdBy: FARMER_A },
  { id: 's-b', farmId: FARM_B, createdBy: FARMER_B },
  { id: 's-c', farmId: FARM_A, createdBy: FARMER_C },
]
const GAP: Row[] = [
  { id: 'g-a', farmId: FARM_A, createdBy: FARMER_A },
  { id: 'g-a2', farmId: FARM_A2, createdBy: FARMER_A },
  { id: 'g-b', farmId: FARM_B, createdBy: FARMER_B },
  { id: 'g-c', farmId: FARM_A, createdBy: FARMER_C },
  { id: 'g-orphan', farmId: null, createdBy: FARMER_D },
]

function matchesFarm(farmId: string | null, filter: any): boolean {
  if (filter === undefined) return true
  if (filter === null || typeof filter === 'string') return farmId === filter
  if (Array.isArray(filter.in)) return farmId !== null && filter.in.includes(farmId)
  throw new Error(`unexpected farmId filter ${JSON.stringify(filter)}`)
}

// findMany filters by farmId; findUnique answers select and include reads.
function recordModel(rows: Row[]) {
  return {
    findMany: jest.fn(async (args: any) =>
      rows
        .filter(r => matchesFarm(r.farmId, args?.where?.farmId))
        .map(r => ({ ...r, farm: farmView(r.farmId) })),
    ),
    findUnique: jest.fn(async (args: any) => {
      const row = rows.find(r => r.id === args.where.id)
      if (!row) return null
      return { ...row, farm: farmView(row.farmId, args.select?.farm ?? args.include?.farm) }
    }),
    findFirst: jest.fn(async () => null),
    create: jest.fn(async (args: any) => ({ id: 'new-row', ...args.data, farm: farmView(args.data.farmId) })),
    update: jest.fn(async (args: any) => {
      const row = rows.find(r => r.id === args.where.id)!
      return { ...row, ...args.data }
    }),
    delete: jest.fn(async () => ({})),
    deleteMany: jest.fn(async () => ({ count: 0 })),
    count: jest.fn(async () => 0),
  }
}

const CROP_YEAR = { id: 'cy-1', year: '2026/2027', startDate: new Date('2026-10-01'), endDate: new Date('2027-09-30') }

const mockPrisma: any = {
  farm: {
    findMany: jest.fn(async (args: any) => {
      const or = args?.where?.OR
      return Object.keys(FARMS)
        .filter(id => !or || or.some((c: any) =>
          c.ownerId !== undefined
            ? FARMS[id].ownerId === c.ownerId
            : FARMS[id].collaborators.includes(c.collaborators.some.userId),
        ))
        .map(id => farmView(id))
    }),
    findUnique: jest.fn(async (args: any) => farmView(args.where.id, args)),
    create: jest.fn(async (args: any) => ({ id: 'new-farm', ...args.data })),
    update: jest.fn(async (args: any) => ({ ...farmView(args.where.id), ...args.data })),
    delete: jest.fn(async () => ({})),
  },
  farmCollaborator: {
    findUnique: jest.fn(async (args: any) => {
      const { farmId, userId } = args.where.farmId_userId
      return FARMS[farmId]?.collaborators.includes(userId) ? { farmId, userId } : null
    }),
    findMany: jest.fn(async () => []),
    upsert: jest.fn(async (args: any) => ({ ...args.create })),
    deleteMany: jest.fn(async () => ({ count: 1 })),
  },
  user: { findUnique: jest.fn(async (args: any) => ({ id: args.where.id, isActive: true })) },
  weatherRecord: recordModel(WEATHER),
  soilAnalysis: recordModel(SOIL),
  gAPLogEntry: recordModel(GAP),
  harvestLot: { count: jest.fn(async () => 0), updateMany: jest.fn(async () => ({ count: 0 })) },
  activityType: { findUnique: jest.fn(async (args: any) => ({ id: args.where.id, name: 'Fertilizer' })) },
  cropYear: {
    upsert: jest.fn(async (args: any) => ({ id: args.where.year, ...args.create })),
    findMany: jest.fn(async () => [{ ...CROP_YEAR, _count: { harvestLots: 4, processingBatches: 2 } }]),
    findUnique: jest.fn(async (args: any) => {
      if (args.where.id !== CROP_YEAR.id) return null
      const include = args.include ?? {}
      return {
        ...CROP_YEAR,
        ...(include.harvestLots ? { harvestLots: [{ id: 'lot-of-farmer-b', farmerName: 'B' }] } : {}),
        ...(include.processingBatches ? { processingBatches: [{ id: 'batch-of-processor' }] } : {}),
        ...(include._count ? { _count: { harvestLots: 4, processingBatches: 2 } } : {}),
      }
    }),
  },
  // The rest of bulk-load phase 2, which these tests do not look at.
  processingBatch: { findMany: jest.fn(async () => []) },
  parchmentLot: { findMany: jest.fn(async () => []) },
  greenBeanLot: { findMany: jest.fn(async () => []) },
  roasterInventoryItem: { findMany: jest.fn(async () => []) },
  roastBatch: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
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

const BASE = 'http://localhost:3001/api'

async function call(
  mod: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  { id, body }: { id?: string; body?: unknown } = {},
) {
  const route: any = await import(`@/app/api/${mod}`)
  const request = new NextRequest(`${BASE}/${path}`, {
    method,
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })
  const response = id === undefined
    ? await route[method](request)
    : await route[method](request, { params: Promise.resolve({ id }) })
  return { status: response.status as number, data: await response.json() }
}

const today = new Date().toISOString().slice(0, 10)

const KINDS = [
  {
    name: 'weather records',
    path: 'weather-records',
    listKey: 'weatherRecords',
    itemKey: 'weatherRecord',
    model: () => mockPrisma.weatherRecord,
    ids: { a: 'w-a', b: 'w-b' },
    createBody: (farmId: string) => ({
      farmId, farmPlotLocation: 'Plot 1', recordDate: today,
      temperatureMin: 18, temperatureMax: 28, temperatureAvg: 23, rainfall: 2, humidity: 80,
    }),
  },
  {
    name: 'soil analyses',
    path: 'soil-analyses',
    listKey: 'soilAnalyses',
    itemKey: 'soilAnalysis',
    model: () => mockPrisma.soilAnalysis,
    ids: { a: 's-a', b: 's-b' },
    createBody: (farmId: string) => ({
      farmId, farmPlotLocation: 'Plot 1', testDate: today,
      pH: 5.5, phosphorus: 10, potassium: 20, calcium: 30, magnesium: 40,
    }),
  },
  {
    name: 'GAP logs',
    path: 'gap-logs',
    listKey: 'gapLogs',
    itemKey: 'gapLog',
    model: () => mockPrisma.gAPLogEntry,
    ids: { a: 'g-a', b: 'g-b' },
    createBody: (farmId: string) => ({
      farmId, farmPlotLocation: 'Plot 1', activityTypeId: 'at-1', date: today,
      productUsed: 'Compost', quantity: '10 kg',
    }),
  },
]

const list = (k: typeof KINDS[number], query = '') => call(`${k.path}/route`, 'GET', `${k.path}${query}`)
const getOne = (k: typeof KINDS[number], id: string) => call(`${k.path}/[id]/route`, 'GET', `${k.path}/${id}`, { id })
const listedIds = (k: typeof KINDS[number], data: any) => (data[k.listKey] as Row[]).map(r => r.id).sort()

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
})

describe.each(KINDS)('$name list (F19)', k => {
  const rowsOn = (...farmIds: Array<string | null>) =>
    ({ 'weather records': WEATHER, 'soil analyses': SOIL, 'GAP logs': GAP } as Record<string, Row[]>)[k.name]
      .filter(r => farmIds.includes(r.farmId))
      .map(r => r.id)
      .sort()

  test('one farm asked for: only that farm, not the owner\'s other farms', async () => {
    mockAuthUser = farmerA
    const { status, data } = await list(k, `?farmId=${FARM_A}`)
    expect(status).toBe(200)
    expect(listedIds(k, data)).toEqual(rowsOn(FARM_A))
  })

  test('a collaborator sees the shared farm they opened', async () => {
    mockAuthUser = collaborator
    const { status, data } = await list(k, `?farmId=${FARM_A}`)
    expect(status).toBe(200)
    expect(listedIds(k, data)).toEqual(rowsOn(FARM_A))
  })

  test('someone else\'s farm is a 403', async () => {
    mockAuthUser = farmerB
    const { status } = await list(k, `?farmId=${FARM_A}`)
    expect(status).toBe(403)
    expect(k.model().findMany).not.toHaveBeenCalled()
  })

  test('no farm asked for: owned and shared farms only', async () => {
    mockAuthUser = farmerA
    expect(listedIds(k, (await list(k)).data)).toEqual(rowsOn(FARM_A, FARM_A2))
    mockAuthUser = collaborator
    expect(listedIds(k, (await list(k)).data)).toEqual(rowsOn(FARM_A))
  })

  test('a user with no farms gets nothing (no legacy GAP logs either)', async () => {
    mockAuthUser = farmerNoFarms
    const { status, data } = await list(k)
    expect(status).toBe(200)
    expect(data[k.listKey]).toEqual([])
  })

  test('a non-farmer account is scoped the same way', async () => {
    mockAuthUser = processor
    expect((await list(k)).data[k.listKey]).toEqual([])
    expect((await list(k, `?farmId=${FARM_B}`)).status).toBe(403)
  })

  test('Admins and super admins see every farm, or just the one asked for', async () => {
    for (const u of [admin, superAdmin, superAdminFarmer]) {
      mockAuthUser = u
      expect(listedIds(k, (await list(k)).data)).toEqual(rowsOn(FARM_A, FARM_A2, FARM_B, null))
      expect(listedIds(k, (await list(k, `?farmId=${FARM_B}`)).data)).toEqual(rowsOn(FARM_B))
    }
  })
})

describe.each(KINDS)('$name GET by id (F32)', k => {
  test('another farmer gets 403', async () => {
    mockAuthUser = farmerB
    const { status, data } = await getOne(k, k.ids.a)
    expect(status).toBe(403)
    expect(data[k.itemKey]).toBeUndefined()
  })

  test('the owner, a collaborator, an Admin and a super admin can read it', async () => {
    for (const u of [farmerA, collaborator, admin, superAdmin]) {
      mockAuthUser = u
      const { status, data } = await getOne(k, k.ids.a)
      expect(status).toBe(200)
      expect(data[k.itemKey].id).toBe(k.ids.a)
    }
  })

  test('a missing record is a 404', async () => {
    mockAuthUser = admin
    expect((await getOne(k, 'nope')).status).toBe(404)
  })

  test('needs a login', async () => {
    expect((await getOne(k, k.ids.a)).status).toBe(401)
  })
})

describe('bulk-load phase 2 scopes soil, weather and GAP like the list routes (F19)', () => {
  const phase2 = async () => {
    const { status, data } = await call('bulk-load/route', 'GET', 'bulk-load?phase=2')
    expect(status).toBe(200)
    return data
  }
  const ids = (rows: Row[]) => rows.map(r => r.id).sort()

  test.each([
    ['a Processor', processor],
    ['a Roaster', user('roaster-1', ['Roaster'])],
    ['a Cupper', user('cupper-1', ['Cupper'])],
    ['a HeadJudge', user('judge-1', ['HeadJudge'])],
  ])('%s with no farms gets none, though the by-id routes refuse them', async (_who, staff) => {
    mockAuthUser = staff
    const data = await phase2()
    expect(data.soilAnalyses).toEqual([])
    expect(data.weatherRecords).toEqual([])
    expect(data.gapLogs).toEqual([])
  })

  test('a farmer or collaborator gets their own and shared farms only', async () => {
    mockAuthUser = collaborator
    const data = await phase2()
    expect(ids(data.gapLogs)).toEqual(['g-a', 'g-c'])
    expect(ids(data.soilAnalyses)).toEqual(['s-a', 's-c'])
    expect(ids(data.weatherRecords)).toEqual(['w-a'])
  })

  test("a Processor who also owns a farm gets that farm's records only", async () => {
    mockAuthUser = user(FARMER_B, ['Processor'])
    expect(ids((await phase2()).gapLogs)).toEqual(['g-b'])
  })

  test("Admins and super admins get every farm's", async () => {
    for (const u of [admin, superAdmin]) {
      mockAuthUser = u
      expect(ids((await phase2()).gapLogs)).toEqual(GAP.map(r => r.id).sort())
    }
  })
})

describe('legacy GAP log without a farm', () => {
  test('its creator and Admins can read it, other farmers cannot', async () => {
    const k = KINDS[2]
    mockAuthUser = farmerNoFarms
    expect((await getOne(k, 'g-orphan')).status).toBe(200)
    mockAuthUser = admin
    expect((await getOne(k, 'g-orphan')).status).toBe(200)
    mockAuthUser = farmerA
    expect((await getOne(k, 'g-orphan')).status).toBe(403)
  })
})

describe.each(KINDS)('collaborators record $name on a shared farm (D5)', k => {
  test('a collaborator can create on the shared farm', async () => {
    mockAuthUser = collaborator
    const { status } = await call(`${k.path}/route`, 'POST', k.path, { body: k.createBody(FARM_A) })
    expect(status).toBe(201)
    expect(k.model().create).toHaveBeenCalledTimes(1)
  })

  test('nobody else can create on it', async () => {
    mockAuthUser = farmerB
    const { status } = await call(`${k.path}/route`, 'POST', k.path, { body: k.createBody(FARM_A) })
    expect(status).toBe(403)
    expect(k.model().create).not.toHaveBeenCalled()
  })

  test('a collaborator can edit a record someone else made on the shared farm', async () => {
    mockAuthUser = collaborator
    const { status } = await call(`${k.path}/[id]/route`, 'PUT', `${k.path}/${k.ids.a}`, {
      id: k.ids.a,
      body: { farmPlotLocation: 'Plot 2' },
    })
    expect(status).toBe(200)
    expect(k.model().update).toHaveBeenCalledTimes(1)
  })

  test('another farmer cannot edit it', async () => {
    mockAuthUser = farmerB
    const { status } = await call(`${k.path}/[id]/route`, 'PUT', `${k.path}/${k.ids.a}`, {
      id: k.ids.a,
      body: { farmPlotLocation: 'Plot 2' },
    })
    expect(status).toBe(403)
    expect(k.model().update).not.toHaveBeenCalled()
  })
})

describe('deletes stay with the farm owner (and Admins)', () => {
  test('a collaborator cannot delete a weather record or a soil analysis on the shared farm', async () => {
    mockAuthUser = collaborator
    expect((await call('weather-records/[id]/route', 'DELETE', 'weather-records/w-a', { id: 'w-a' })).status).toBe(403)
    expect((await call('soil-analyses/[id]/route', 'DELETE', 'soil-analyses/s-a', { id: 's-a' })).status).toBe(403)
    expect(mockPrisma.weatherRecord.delete).not.toHaveBeenCalled()
    expect(mockPrisma.soilAnalysis.delete).not.toHaveBeenCalled()
  })

  test('a super admin without the Admin role can delete a soil analysis', async () => {
    mockAuthUser = superAdmin
    expect((await call('soil-analyses/[id]/route', 'DELETE', 'soil-analyses/s-a', { id: 's-a' })).status).toBe(200)
    expect(mockPrisma.soilAnalysis.delete).toHaveBeenCalledTimes(1)
  })
})

describe('moving a GAP log to another farm (F15)', () => {
  const put = (id: string, body: unknown) =>
    call('gap-logs/[id]/route', 'PUT', `gap-logs/${id}`, { id, body })
  const writtenFarmId = () => (mockPrisma.gAPLogEntry.update.mock.calls[0][0] as any).data.farmId

  test('the creator cannot move it onto another farmer\'s farm', async () => {
    mockAuthUser = farmerA
    const { status } = await put('g-a', { farmId: FARM_B })
    expect(status).toBe(403)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
  })

  test('a collaborator cannot move their log off the shared farm onto someone else\'s', async () => {
    mockAuthUser = collaborator
    const { status } = await put('g-c', { farmId: FARM_B })
    expect(status).toBe(403)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
  })

  test('the owner can move it between their own farms', async () => {
    mockAuthUser = farmerA
    const { status } = await put('g-a', { farmId: FARM_A2 })
    expect(status).toBe(200)
    expect(writtenFarmId()).toBe(FARM_A2)
  })

  test('an Admin can move it anywhere', async () => {
    mockAuthUser = admin
    expect((await put('g-a', { farmId: FARM_B })).status).toBe(200)
    expect(writtenFarmId()).toBe(FARM_B)
  })

  test('a farm that does not exist is a 404', async () => {
    mockAuthUser = farmerA
    expect((await put('g-a', { farmId: NO_SUCH_FARM })).status).toBe(404)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
  })

  test('sending the farm it is already on is a normal edit', async () => {
    mockAuthUser = collaborator
    expect((await put('g-a', { farmId: FARM_A, notes: 'checked' })).status).toBe(200)
    expect(writtenFarmId()).toBe(FARM_A)
  })

  test('only an Admin can take a log off its farm', async () => {
    mockAuthUser = farmerA
    expect((await put('g-a', { farmId: null })).status).toBe(403)
    expect((await put('g-a', { farmId: '' })).status).toBe(403)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()

    mockAuthUser = admin
    expect((await put('g-a', { farmId: null })).status).toBe(200)
    expect(writtenFarmId()).toBeNull()
  })

  test('a farmId that is not a string is a 400', async () => {
    mockAuthUser = farmerA
    expect((await put('g-a', { farmId: { in: [FARM_B] } })).status).toBe(400)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
  })
})

describe('taking a GAP log off a shared farm', () => {
  const put = (id: string, body: unknown) =>
    call('gap-logs/[id]/route', 'PUT', `gap-logs/${id}`, { id, body })

  test("a collaborator cannot move the owner's log onto a farm of their own", async () => {
    // They may not delete it there either; a move would pull it out of the
    // owner's GAP trail all the same.
    mockAuthUser = collaborator
    const { status } = await put('g-a', { farmId: FARM_C })
    expect(status).toBe(403)
    expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
    expect((await call('gap-logs/[id]/route', 'DELETE', 'gap-logs/g-a', { id: 'g-a' })).status).toBe(403)
  })

  test("a collaborator may still edit the owner's log in place", async () => {
    mockAuthUser = collaborator
    expect((await put('g-a', { notes: 'checked' })).status).toBe(200)
  })

  test('a collaborator may move a log they recorded, as they may delete it', async () => {
    mockAuthUser = collaborator
    expect((await put('g-c', { farmId: FARM_C })).status).toBe(200)
  })
})

describe('recording a record gives no access once off the farm', () => {
  const removeCollaborator = () => {
    const before = FARMS[FARM_A].collaborators
    FARMS[FARM_A].collaborators = []
    return () => { FARMS[FARM_A].collaborators = before }
  }
  const transferFarmA2ToB = () => {
    FARMS[FARM_A2].ownerId = FARMER_B
    return () => { FARMS[FARM_A2].ownerId = FARMER_A }
  }

  test('a removed collaborator cannot read, edit, move or delete the GAP log they wrote', async () => {
    const restore = removeCollaborator()
    try {
      mockAuthUser = collaborator
      expect((await call('gap-logs/[id]/route', 'GET', 'gap-logs/g-c', { id: 'g-c' })).status).toBe(403)
      expect((await call('gap-logs/[id]/route', 'PUT', 'gap-logs/g-c', { id: 'g-c', body: { notes: 'x' } })).status).toBe(403)
      expect((await call('gap-logs/[id]/route', 'PUT', 'gap-logs/g-c', { id: 'g-c', body: { farmId: FARM_C } })).status).toBe(403)
      expect((await call('gap-logs/[id]/route', 'DELETE', 'gap-logs/g-c', { id: 'g-c' })).status).toBe(403)
      expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
      expect(mockPrisma.gAPLogEntry.delete).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  test('a removed collaborator cannot read or edit the soil analysis they wrote', async () => {
    const restore = removeCollaborator()
    try {
      mockAuthUser = collaborator
      expect((await call('soil-analyses/[id]/route', 'GET', 'soil-analyses/s-c', { id: 's-c' })).status).toBe(403)
      expect((await call('soil-analyses/[id]/route', 'PUT', 'soil-analyses/s-c', { id: 's-c', body: { notes: 'x' } })).status).toBe(403)
      expect(mockPrisma.soilAnalysis.update).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  test("after an Admin transfers a farm, its old owner has no hold on the farm's GAP logs and soil analyses", async () => {
    const restore = transferFarmA2ToB()
    try {
      mockAuthUser = farmerA
      expect((await call('gap-logs/[id]/route', 'GET', 'gap-logs/g-a2', { id: 'g-a2' })).status).toBe(403)
      expect((await call('gap-logs/[id]/route', 'PUT', 'gap-logs/g-a2', { id: 'g-a2', body: { farmId: FARM_A } })).status).toBe(403)
      expect((await call('gap-logs/[id]/route', 'DELETE', 'gap-logs/g-a2', { id: 'g-a2' })).status).toBe(403)
      expect((await call('soil-analyses/[id]/route', 'GET', 'soil-analyses/s-a2', { id: 's-a2' })).status).toBe(403)
      expect((await call('soil-analyses/[id]/route', 'PUT', 'soil-analyses/s-a2', { id: 's-a2', body: { notes: 'x' } })).status).toBe(403)
      expect(mockPrisma.gAPLogEntry.update).not.toHaveBeenCalled()
      expect(mockPrisma.gAPLogEntry.delete).not.toHaveBeenCalled()
      expect(mockPrisma.soilAnalysis.update).not.toHaveBeenCalled()

      // The new owner has them.
      mockAuthUser = farmerB
      expect((await call('gap-logs/[id]/route', 'GET', 'gap-logs/g-a2', { id: 'g-a2' })).status).toBe(200)
    } finally {
      restore()
    }
  })

  test('a member who recorded a GAP log may still delete it', async () => {
    mockAuthUser = collaborator
    expect((await call('gap-logs/[id]/route', 'DELETE', 'gap-logs/g-c', { id: 'g-c' })).status).toBe(200)
  })
})

describe('crop years (F16)', () => {
  test('GET /crop-years needs a login and writes nothing without one', async () => {
    const { status } = await call('crop-years/route', 'GET', 'crop-years')
    expect(status).toBe(401)
    expect(mockPrisma.cropYear.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.cropYear.findMany).not.toHaveBeenCalled()
  })

  test('GET /crop-years still ensures and lists crop years for a logged-in user', async () => {
    mockAuthUser = farmerA
    const { status, data } = await call('crop-years/route', 'GET', 'crop-years')
    expect(status).toBe(200)
    expect(mockPrisma.cropYear.upsert).toHaveBeenCalledTimes(3)
    expect(data.cropYears).toHaveLength(1)
  })

  test('GET /crop-years/:id returns counts, not other farmers\' lots and batches', async () => {
    mockAuthUser = farmerA
    const { status, data } = await call('crop-years/[id]/route', 'GET', 'crop-years/cy-1', { id: 'cy-1' })
    expect(status).toBe(200)
    expect(data.cropYear._count).toEqual({ harvestLots: 4, processingBatches: 2 })
    expect(data.cropYear.harvestLots).toBeUndefined()
    expect(data.cropYear.processingBatches).toBeUndefined()
  })
})

describe('farm routes treat a super admin as an Admin', () => {
  const farmCall = (method: 'GET' | 'PUT' | 'DELETE', body?: unknown) =>
    call('farms/[id]/route', method, `farms/${FARM_A}`, { id: FARM_A, body })

  test('a super admin without the Admin role can read, edit and delete any farm', async () => {
    mockAuthUser = superAdmin
    expect((await farmCall('GET')).status).toBe(200)
    expect((await farmCall('PUT', { farmName: 'Renamed' })).status).toBe(200)
    expect((await farmCall('DELETE')).status).toBe(200)
    expect(mockPrisma.farm.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.farm.delete).toHaveBeenCalledTimes(1)
  })

  test('a collaborator can read the farm but not edit or delete it', async () => {
    mockAuthUser = collaborator
    expect((await farmCall('GET')).status).toBe(200)
    expect((await farmCall('PUT', { farmName: 'Renamed' })).status).toBe(403)
    expect((await farmCall('DELETE')).status).toBe(403)
    expect(mockPrisma.farm.update).not.toHaveBeenCalled()
    expect(mockPrisma.farm.delete).not.toHaveBeenCalled()
  })

  test('another farmer gets 403 everywhere', async () => {
    mockAuthUser = farmerB
    expect((await farmCall('GET')).status).toBe(403)
    expect((await farmCall('PUT', { farmName: 'Renamed' })).status).toBe(403)
    expect((await farmCall('DELETE')).status).toBe(403)
  })

  test('a super admin can manage any farm\'s collaborators', async () => {
    mockAuthUser = superAdmin
    const path = `farms/${FARM_A}/collaborators`
    expect((await call('farms/[id]/collaborators/route', 'GET', path, { id: FARM_A })).status).toBe(200)
    expect((await call('farms/[id]/collaborators/route', 'POST', path, { id: FARM_A, body: { userId: FARMER_D } })).status).toBe(201)
    expect((await call('farms/[id]/collaborators/route', 'DELETE', `${path}?userId=${FARMER_C}`, { id: FARM_A })).status).toBe(200)
  })

  test('a super admin lists every farm and can create one for another owner', async () => {
    mockAuthUser = superAdmin
    const listed = await call('farms/route', 'GET', 'farms')
    expect(listed.data.farms.map((f: any) => f.id).sort()).toEqual([FARM_A, FARM_A2, FARM_B, FARM_C].sort())

    const created = await call('farms/route', 'POST', 'farms', {
      body: { farmName: 'New Farm', location: 'Nan', googleMapsUrl: '', ownerId: FARMER_B },
    })
    expect(created.status).toBe(201)
    expect((mockPrisma.farm.create.mock.calls[0][0] as any).data.ownerId).toBe(FARMER_B)
  })
})
