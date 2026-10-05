/**
 * Owner decision 2026-10-05, "each their own" (ของใครของมัน): the lot chain
 * routes used to show every staff user every lot. Now (lib/farmAccess
 * chainScope):
 * - Admin and super admin see everything; HeadJudge and Cupper read as before
 * - a Processor reads their own batches, those batches' parchment and cherry
 *   lots, the parchment they imported, and their own green-bean lots with
 *   their price history; cherry still Ready for Processing is open to every
 *   processor
 * - a Roaster reads the green-bean lots they bought in, hold stock of or
 *   roasted, plus the shelf (Internal, Available, kg left) but never another
 *   user's bought-in lot, which they cannot claim either; parchment and
 *   cherry lots only as the source of those lots; no batches; price history
 *   only of lots they bought in or hold
 * - a Farmer reads the chain from farms they own or collaborate on
 * - several roles read the union; no role reads nothing
 * Lists filter; by id, a record out of scope is 403 and a missing one 404.
 *
 * The routes run against a small in-memory store that evaluates the Prisma
 * where clauses they send, so these tests check which rows each user gets.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

type Row = Record<string, any>
type Relation = { model: string; kind: 'one' | 'many'; fk: string }

const one = (model: string, fk: string): Relation => ({ model, kind: 'one', fk })
const many = (model: string, fk: string): Relation => ({ model, kind: 'many', fk })

const RELATIONS: Record<string, Record<string, Relation>> = {
  farm: { collaborators: many('farmCollaborator', 'farmId') },
  harvestLot: {
    farm: one('farm', 'farmId'),
    processingBatches: many('processingBatch', 'harvestLotId'),
    parchmentLots: many('parchmentLot', 'harvestLotId'),
  },
  processingBatch: {
    harvestLot: one('harvestLot', 'harvestLotId'),
    parchmentLots: many('parchmentLot', 'processingBatchId'),
  },
  parchmentLot: {
    processingBatch: one('processingBatch', 'processingBatchId'),
    harvestLot: one('harvestLot', 'harvestLotId'),
    greenBeanLots: many('greenBeanLot', 'parchmentLotId'),
  },
  greenBeanLot: {
    parchmentLot: one('parchmentLot', 'parchmentLotId'),
    roasterInventory: many('roasterInventoryItem', 'greenBeanLotId'),
    roastBatches: many('roastBatch', 'greenBeanLotId'),
  },
  pricingHistory: { greenBeanLot: one('greenBeanLot', 'greenBeanLotId') },
  roasterInventoryItem: { greenBeanLot: one('greenBeanLot', 'greenBeanLotId') },
}

// ---- users ----------------------------------------------------------------

const user = (id: string, roles: string[], isSuperAdmin = false) => ({
  id, email: null, username: null, name: id, roles, isActive: true, isSuperAdmin,
})
const procA = user('proc-a', ['Processor'])
const procB = user('proc-b', ['Processor'])
const roasterA = user('roaster-a', ['Roaster'])
const roasterB = user('roaster-b', ['Roaster'])
const owner = user('farmer-1', ['Farmer'])
const collaborator = user('farmer-2', ['Farmer'])
const otherFarmer = user('farmer-3', ['Farmer'])
const farmerProcessor = user('fp-1', ['Farmer', 'Processor'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const cupper = user('cupper-1', ['Cupper'])
const headJudge = user('judge-1', ['HeadJudge'])
const noRole = user('nobody-1', [])

// ---- the store --------------------------------------------------------------

const seed = (): Record<string, Row[]> => ({
  farm: [
    { id: 'farm-1', ownerId: 'farmer-1', farmName: 'Doi Farm', location: 'Chiang Rai' },
    { id: 'farm-3', ownerId: 'farmer-3', farmName: 'Mae Farm', location: 'Nan' },
    { id: 'farm-fp', ownerId: 'fp-1', farmName: 'Mill Farm', location: 'Lampang' },
  ],
  // Farmer 2 helps on farmer 1's farm.
  farmCollaborator: [{ id: 'fc-1', farmId: 'farm-1', userId: 'farmer-2' }],
  harvestLot: [
    {
      id: 'hl-a', farmId: 'farm-1', createdById: 'farmer-1', status: 'Complete', weightKg: 100,
      farmerName: 'Somchai', cherryVariety: 'Typica',
    },
    { id: 'hl-b', farmId: 'farm-3', createdById: 'farmer-3', status: 'Complete', weightKg: 100 },
    { id: 'hl-ready', farmId: 'farm-3', createdById: 'farmer-3', status: 'ReadyForProcessing', weightKg: 80 },
    // The Farmer+Processor's own farm, processed by processor B.
    { id: 'hl-fp', farmId: 'farm-fp', createdById: 'fp-1', status: 'Complete', weightKg: 60 },
    // Farmer 3's cherry, processed by the Farmer+Processor.
    { id: 'hl-fp2', farmId: 'farm-3', createdById: 'farmer-3', status: 'Complete', weightKg: 50 },
  ],
  processingBatch: [
    { id: 'pb-a', harvestLotId: 'hl-a', createdById: 'proc-a', processType: 'Washed' },
    { id: 'pb-b', harvestLotId: 'hl-b', createdById: 'proc-b', processType: 'Natural' },
    { id: 'pb-fp-other', harvestLotId: 'hl-fp', createdById: 'proc-b', processType: 'Honey' },
    { id: 'pb-fp', harvestLotId: 'hl-fp2', createdById: 'fp-1', processType: 'Washed' },
  ],
  parchmentLot: [
    { id: 'pl-a', processingBatchId: 'pb-a', harvestLotId: 'hl-a', sourceType: 'Internal', processType: 'Washed' },
    { id: 'pl-b', processingBatchId: 'pb-b', harvestLotId: 'hl-b', sourceType: 'Internal', processType: 'Natural' },
    { id: 'pl-fp-other', processingBatchId: 'pb-fp-other', harvestLotId: 'hl-fp', sourceType: 'Internal', processType: 'Honey' },
    { id: 'pl-fp', processingBatchId: 'pb-fp', harvestLotId: 'hl-fp2', sourceType: 'Internal', processType: 'Washed' },
    // Bought in from an Excel sheet by processor A.
    {
      id: 'pl-ext-a', processingBatchId: null, harvestLotId: null, sourceType: 'External', processType: 'Washed',
      externalSource: { code: 'X-1', importedBy: 'proc-a' },
    },
    // Bought in before the importer was recorded: Admin-only.
    {
      id: 'pl-ext-old', processingBatchId: null, harvestLotId: null, sourceType: 'External', processType: 'Natural',
      externalSource: { code: 'X-0' },
    },
  ],
  greenBeanLot: [
    { id: 'gbl-a', parchmentLotId: 'pl-a', createdById: 'proc-a', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0 },
    { id: 'gbl-a-shelf', parchmentLotId: 'pl-a', createdById: 'proc-a', sourceType: 'Internal', availabilityStatus: 'Available', currentWeightKg: 30 },
    { id: 'gbl-b', parchmentLotId: 'pl-b', createdById: 'proc-b', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0 },
    { id: 'gbl-b-held', parchmentLotId: 'pl-b', createdById: 'proc-b', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0 },
    // Available with kg left, but bought in by a roaster: theirs alone.
    { id: 'gbl-ext-ra', parchmentLotId: null, createdById: 'roaster-a', sourceType: 'External', availabilityStatus: 'Available', currentWeightKg: 20 },
    { id: 'gbl-ext-rb', parchmentLotId: null, createdById: 'roaster-b', sourceType: 'External', availabilityStatus: 'Available', currentWeightKg: 20 },
    { id: 'gbl-fp', parchmentLotId: 'pl-fp', createdById: 'fp-1', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0 },
  ],
  roasterInventoryItem: [{ id: 'inv-1', roasterId: 'roaster-a', greenBeanLotId: 'gbl-b-held' }],
  roastBatch: [{ id: 'rb-1', roasterId: 'roaster-b', greenBeanLotId: 'gbl-b' }],
  pricingHistory: [
    { id: 'ph-a', greenBeanLotId: 'gbl-a' },
    { id: 'ph-a-shelf', greenBeanLotId: 'gbl-a-shelf' },
    { id: 'ph-b', greenBeanLotId: 'gbl-b' },
    { id: 'ph-b-held', greenBeanLotId: 'gbl-b-held' },
    { id: 'ph-ext-ra', greenBeanLotId: 'gbl-ext-ra' },
    { id: 'ph-fp', greenBeanLotId: 'gbl-fp' },
  ],
})

let tables = seed()

function related(model: string, key: string, row: Row): Row | Row[] | null {
  const rel = RELATIONS[model]?.[key]
  if (!rel) throw new Error(`store: unknown relation ${model}.${key}`)
  if (rel.kind === 'one') return tables[rel.model].find(r => r.id === row[rel.fk]) ?? null
  return tables[rel.model].filter(r => r[rel.fk] === row.id)
}

function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond === null) return actual === null || actual === undefined
  if (typeof cond !== 'object' || Array.isArray(cond)) return actual === cond
  const ops = cond as Row
  if ('path' in ops) {
    let value: any = actual
    for (const key of ops.path as string[]) value = value?.[key]
    return value === ops.equals
  }
  return Object.entries(ops).every(([op, operand]) => {
    switch (op) {
      case 'equals': return actual === operand
      case 'in': return (operand as unknown[]).includes(actual)
      case 'not': return actual !== null && actual !== undefined && actual !== operand
      case 'gt': return typeof actual === 'number' && actual > (operand as number)
      default: throw new Error(`store: unsupported filter ${op}`)
    }
  })
}

function matches(model: string, row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true
    if (key === 'AND') return (cond as Row[]).every(part => matches(model, row, part))
    if (key === 'OR') return (cond as Row[]).some(part => matches(model, row, part))
    const rel = RELATIONS[model]?.[key]
    if (rel?.kind === 'many') {
      const list = related(model, key, row) as Row[]
      const filter = cond as Row
      if (filter.some) return list.some(r => matches(rel.model, r, filter.some))
      if (filter.none) return !list.some(r => matches(rel.model, r, filter.none))
      throw new Error(`store: unsupported list filter on ${model}.${key}`)
    }
    if (rel?.kind === 'one') {
      const target = related(model, key, row) as Row | null
      if (cond === null) return target === null
      return target !== null && matches(rel.model, target, cond as Row)
    }
    return matchValue(row[key], cond)
  })
}

// Rows come back whole, with the relations the route includes or selects
// attached.
function shape(model: string, row: Row, include?: Row): Row {
  const out: Row = { ...row }
  if (model === 'harvestLot') {
    out._count = { processingBatches: (related(model, 'processingBatches', row) as Row[]).length }
  }
  for (const [key, spec] of Object.entries(include ?? {})) {
    const rel = RELATIONS[model]?.[key]
    if (!rel || !spec) continue
    const nested = typeof spec === 'object' ? (spec as Row) : {}
    if (rel.kind === 'one') {
      const target = related(model, key, row) as Row | null
      out[key] = target ? shape(rel.model, target, nested.include ?? nested.select) : null
    } else {
      out[key] = (related(model, key, row) as Row[])
        .filter(r => matches(rel.model, r, nested.where))
        .map(r => shape(rel.model, r, nested.include ?? nested.select))
    }
  }
  return out
}

function find(model: string, args: Row = {}): Row[] {
  let rows = tables[model].filter(r => matches(model, r, args.where))
  if (typeof args.skip === 'number') rows = rows.slice(args.skip)
  if (typeof args.take === 'number') rows = rows.slice(0, args.take)
  return rows.map(r => shape(model, r, args.include))
}

const delegate = (model: string) => ({
  findMany: jest.fn(async (args: any = {}) => find(model, args)),
  findFirst: jest.fn(async (args: any = {}) => find(model, args)[0] ?? null),
  findUnique: jest.fn(async (args: any) => find(model, args)[0] ?? null),
  count: jest.fn(async (args: any = {}) => tables[model].filter(r => matches(model, r, args.where)).length),
})

const mockPrisma: any = {
  farm: delegate('farm'),
  harvestLot: delegate('harvestLot'),
  processingBatch: delegate('processingBatch'),
  parchmentLot: delegate('parchmentLot'),
  greenBeanLot: delegate('greenBeanLot'),
  pricingHistory: delegate('pricingHistory'),
  roasterInventoryItem: delegate('roasterInventoryItem'),
  // A claim that got past the checks.
  $transaction: jest.fn(async () => ({ inventoryItem: { id: 'inv-new' }, updatedSourceLot: { id: 'lot' } })),
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

beforeEach(() => {
  jest.clearAllMocks()
  tables = seed()
  mockAuthUser = null
})

// ---- route helpers ----------------------------------------------------------

const request = (url: string, init?: RequestInit) => new NextRequest(`http://localhost:3001${url}`, init as any)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const ids = (rows: Row[]) => rows.map(r => r.id).sort()

type Lists = {
  harvest: string[]
  batches: string[]
  parchment: string[]
  green: string[]
  pricing: string[]
}

async function listAll(viewer: any): Promise<Lists> {
  mockAuthUser = viewer
  const harvestRoute = await import('@/app/api/harvest-lots/route')
  const batchRoute = await import('@/app/api/processing-batches/route')
  const parchmentRoute = await import('@/app/api/parchment-lots/route')
  const greenRoute = await import('@/app/api/green-bean-lots/route')
  const pricingRoute = await import('@/app/api/pricing-history/route')
  const body = async (response: Response) => {
    expect(response.status).toBe(200)
    return response.json()
  }
  return {
    harvest: ids((await body(await harvestRoute.GET(request('/api/harvest-lots')))).harvestLots),
    batches: ids((await body(await batchRoute.GET(request('/api/processing-batches')))).processingBatches),
    parchment: ids((await body(await parchmentRoute.GET(request('/api/parchment-lots')))).parchmentLots),
    green: ids((await body(await greenRoute.GET(request('/api/green-bean-lots')))).greenBeanLots),
    pricing: ids((await body(await pricingRoute.GET(request('/api/pricing-history')))).pricingHistory),
  }
}

type Kind = 'harvest' | 'batch' | 'parchment' | 'green'

async function open(viewer: any, kind: Kind, id: string): Promise<Response> {
  mockAuthUser = viewer
  if (kind === 'harvest') {
    const { GET } = await import('@/app/api/harvest-lots/[id]/route')
    return GET(request(`/api/harvest-lots/${id}`), params(id))
  }
  if (kind === 'batch') {
    const { GET } = await import('@/app/api/processing-batches/[id]/route')
    return GET(request(`/api/processing-batches/${id}`), params(id))
  }
  if (kind === 'parchment') {
    const { GET } = await import('@/app/api/parchment-lots/[id]/route')
    return GET(request(`/api/parchment-lots/${id}`), params(id))
  }
  const { GET } = await import('@/app/api/green-bean-lots/[id]/route')
  return GET(request(`/api/green-bean-lots/${id}`), params(id))
}

async function claim(viewer: any, greenBeanLotId: string): Promise<Response> {
  mockAuthUser = viewer
  const { POST } = await import('@/app/api/roaster-inventory/route')
  return POST(request('/api/roaster-inventory', {
    method: 'POST',
    body: JSON.stringify({ greenBeanLotId, claimedWeightKg: 5 }),
  }))
}

const everything = (): Lists => ({
  harvest: ids(tables.harvestLot),
  batches: ids(tables.processingBatch),
  parchment: ids(tables.parchmentLot),
  green: ids(tables.greenBeanLot),
  pricing: ids(tables.pricingHistory),
})

// ---- processors -------------------------------------------------------------

describe('processors read their own chain', () => {
  test('processor A lists their batch, its parchment and cherry, their import, their green beans and prices, and Ready cherry', async () => {
    expect(await listAll(procA)).toEqual({
      harvest: ['hl-a', 'hl-ready'],
      batches: ['pb-a'],
      parchment: ['pl-a', 'pl-ext-a'],
      green: ['gbl-a', 'gbl-a-shelf'],
      pricing: ['ph-a', 'ph-a-shelf'],
    })
  })

  test('processor B lists their own chain, not processor A\'s', async () => {
    expect(await listAll(procB)).toEqual({
      harvest: ['hl-b', 'hl-fp', 'hl-ready'],
      batches: ['pb-b', 'pb-fp-other'],
      parchment: ['pl-b', 'pl-fp-other'],
      green: ['gbl-b', 'gbl-b-held'],
      pricing: ['ph-b', 'ph-b-held'],
    })
  })

  test.each([
    ['batch', 'pb-b'],
    ['parchment', 'pl-b'],
    ['green', 'gbl-b'],
    ['harvest', 'hl-b'],
  ] as [Kind, string][])("processor A gets 403 opening processor B's %s", async (kind, id) => {
    expect((await open(procA, kind, id)).status).toBe(403)
  })

  test.each([
    ['batch', 'pb-a'],
    ['parchment', 'pl-a'],
    ['parchment', 'pl-ext-a'],
    ['green', 'gbl-a'],
    ['harvest', 'hl-a'],
  ] as [Kind, string][])('processor A opens their own %s', async (kind, id) => {
    expect((await open(procA, kind, id)).status).toBe(200)
  })

  test.each([
    ['batch', 'pb-nope'],
    ['parchment', 'pl-nope'],
    ['green', 'gbl-nope'],
    ['harvest', 'hl-nope'],
  ] as [Kind, string][])('a missing %s is still 404', async (kind, id) => {
    expect((await open(procA, kind, id)).status).toBe(404)
  })

  test('cherry Ready for Processing is open to every processor, by list and by id', async () => {
    for (const viewer of [procA, procB]) {
      expect((await listAll(viewer)).harvest).toContain('hl-ready')
      expect((await open(viewer, 'harvest', 'hl-ready')).status).toBe(200)
    }
  })

  test('parchment bought in with no importer on record is Admin-only', async () => {
    expect((await open(procA, 'parchment', 'pl-ext-old')).status).toBe(403)
    expect((await open(procB, 'parchment', 'pl-ext-a')).status).toBe(403)
    expect((await open(admin, 'parchment', 'pl-ext-old')).status).toBe(200)
  })

  test("a harvest lot lists only the reader's own batches on it", async () => {
    // A legacy lot with two batches from two processors.
    tables.processingBatch.push({ id: 'pb-a2', harvestLotId: 'hl-b', createdById: 'proc-a', processType: 'Washed' })
    const response = await open(procA, 'harvest', 'hl-b')
    expect(response.status).toBe(200)
    const { harvestLot } = await response.json()
    expect(ids(harvestLot.processingBatches)).toEqual(['pb-a2'])
    expect(harvestLot.status).toBe('Complete')
  })
})

// ---- roasters ---------------------------------------------------------------

describe('roasters read their own lots and the shelf', () => {
  test('roaster A gets their bought-in lot, the lot they hold and the shelf, with the parchment and cherry behind them', async () => {
    expect(await listAll(roasterA)).toEqual({
      harvest: ['hl-a', 'hl-b'],
      batches: [],
      parchment: ['pl-a', 'pl-b'],
      green: ['gbl-a-shelf', 'gbl-b-held', 'gbl-ext-ra'],
      // Their own and held lots' prices, not the shelf's.
      pricing: ['ph-b-held', 'ph-ext-ra'],
    })
  })

  test("roaster B gets the lot they roasted and the shelf, never roaster A's bought-in lot", async () => {
    const lists = await listAll(roasterB)
    expect(lists.green).toEqual(['gbl-a-shelf', 'gbl-b', 'gbl-ext-rb'])
    expect(lists.green).not.toContain('gbl-ext-ra')
    expect(lists.batches).toEqual([])
  })

  test("roaster B gets 403 opening roaster A's bought-in lot, and a processor's batch", async () => {
    expect((await open(roasterB, 'green', 'gbl-ext-ra')).status).toBe(403)
    expect((await open(roasterB, 'batch', 'pb-a')).status).toBe(403)
  })

  test("a roaster opens a shelf lot with the batch as a label, not the processor's record", async () => {
    tables.processingBatch[0].processNotes = 'Fermented 36 h, tank 2'
    const response = await open(roasterA, 'green', 'gbl-a-shelf')
    expect(response.status).toBe(200)
    const { greenBeanLot } = await response.json()
    expect(greenBeanLot.parchmentLot.processingBatch).toEqual({
      id: 'pb-a',
      displayId: null,
      processType: 'Washed',
      harvestLot: {
        id: 'hl-a',
        displayId: null,
        farmerName: 'Somchai',
        cherryVariety: 'Typica',
        farm: { id: 'farm-1', farmName: 'Doi Farm', location: 'Chiang Rai' },
      },
    })
  })

  test("a roaster opens a shelf lot's parchment, sees only the green lots they may read, and the batch as a label", async () => {
    const response = await open(roasterA, 'parchment', 'pl-a')
    expect(response.status).toBe(200)
    const { parchmentLot } = await response.json()
    expect(ids(parchmentLot.greenBeanLots)).toEqual(['gbl-a-shelf'])
    expect(Object.keys(parchmentLot.processingBatch).sort()).toEqual(['displayId', 'harvestLot', 'id', 'processType'])
  })

  test("a roaster lists the parchment behind their green beans with the batch's id and process only", async () => {
    for (const batch of tables.processingBatch) batch.status = 'Completed'
    mockAuthUser = roasterA
    const { GET } = await import('@/app/api/parchment-lots/route')
    const response = await GET(request('/api/parchment-lots'))
    expect(response.status).toBe(200)
    const { parchmentLots } = await response.json()
    expect(ids(parchmentLots)).toEqual(['pl-a', 'pl-b'])
    const batches = Object.fromEntries(parchmentLots.map((lot: Row) => [lot.id, lot.processingBatch]))
    expect(batches).toEqual({
      'pl-a': { id: 'pb-a', processType: 'Washed' },
      'pl-b': { id: 'pb-b', processType: 'Natural' },
    })
  })

  test("the batch's processor, its farm's farmer and Admin still list the parchment with the batch's owner and status", async () => {
    tables.processingBatch[0].status = 'Completed'
    for (const viewer of [procA, owner, admin]) {
      mockAuthUser = viewer
      const { GET } = await import('@/app/api/parchment-lots/route')
      const { parchmentLots } = await (await GET(request('/api/parchment-lots'))).json()
      const lot = parchmentLots.find((row: Row) => row.id === 'pl-a')
      expect(lot.processingBatch).toMatchObject({ id: 'pb-a', createdById: 'proc-a', status: 'Completed' })
      // The farm was loaded only for canReadBatch: no reader gets it.
      expect(lot.processingBatch.harvestLot).toBeUndefined()
    }
  })

  test("the processor who owns the batch still gets the whole record", async () => {
    tables.processingBatch[0].processNotes = 'Fermented 36 h, tank 2'
    const { greenBeanLot } = await (await open(procA, 'green', 'gbl-a-shelf')).json()
    expect(greenBeanLot.parchmentLot.processingBatch.processNotes).toBe('Fermented 36 h, tank 2')
  })

  test("a roaster's own stock row carries the lot's batch as a label too", async () => {
    tables.processingBatch[1].processNotes = 'Dried on raised beds'
    mockAuthUser = roasterA
    const { GET } = await import('@/app/api/roaster-inventory/[id]/route')
    const response = await GET(request('/api/roaster-inventory/inv-1'), params('inv-1'))
    expect(response.status).toBe(200)
    const { inventoryItem } = await response.json()
    const batch = inventoryItem.greenBeanLot.parchmentLot.processingBatch
    expect(batch).toMatchObject({ id: 'pb-b', processType: 'Natural' })
    expect(batch).not.toHaveProperty('processNotes')
    expect(batch).not.toHaveProperty('createdById')
  })

  test("a roaster cannot claim another user's bought-in lot", async () => {
    const response = await claim(roasterB, 'gbl-ext-ra')
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('This green bean lot was bought in by another user, so it cannot be claimed')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('a roaster claims from the shelf and from their own bought-in lot', async () => {
    expect((await claim(roasterB, 'gbl-a-shelf')).status).toBe(201)
    expect((await claim(roasterA, 'gbl-ext-ra')).status).toBe(201)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2)
  })

  test("an Admin may claim a roaster's bought-in lot", async () => {
    expect((await claim(admin, 'gbl-ext-ra')).status).toBe(201)
  })
})

// ---- farmers ----------------------------------------------------------------

describe('farmers read the chain from farms they belong to', () => {
  const farmOneChain: Lists = {
    harvest: ['hl-a'],
    batches: ['pb-a'],
    parchment: ['pl-a'],
    green: ['gbl-a', 'gbl-a-shelf'],
    pricing: ['ph-a', 'ph-a-shelf'],
  }

  test("the farm's owner gets its chain", async () => {
    expect(await listAll(owner)).toEqual(farmOneChain)
  })

  test("a collaborator gets the shared farm's harvest lots and chain, as its owner does", async () => {
    expect(await listAll(collaborator)).toEqual(farmOneChain)
    expect((await open(collaborator, 'harvest', 'hl-a')).status).toBe(200)
    expect((await open(collaborator, 'batch', 'pb-a')).status).toBe(200)
  })

  test("a farmer gets 403 on another farm's lot and on bought-in stock", async () => {
    expect((await open(collaborator, 'harvest', 'hl-b')).status).toBe(403)
    expect((await open(owner, 'green', 'gbl-ext-ra')).status).toBe(403)
    expect((await open(owner, 'parchment', 'pl-ext-a')).status).toBe(403)
  })

  test('a lot with no farm stays readable by the farmer it was recorded for', async () => {
    tables.harvestLot.push({ id: 'hl-nofarm', farmId: null, createdById: 'farmer-1', status: 'ReadyForProcessing', weightKg: 10 })
    expect((await open(owner, 'harvest', 'hl-nofarm')).status).toBe(200)
    expect((await open(collaborator, 'harvest', 'hl-nofarm')).status).toBe(403)
  })
})

// ---- several roles, Admin, judges, nobody -------------------------------------

describe('several roles read the union of their scopes', () => {
  test("a Farmer+Processor gets their farm's chain and their own processing chain", async () => {
    expect(await listAll(farmerProcessor)).toEqual({
      // hl-fp: their farm; hl-fp2: their batch; hl-ready: Ready cherry.
      harvest: ['hl-fp', 'hl-fp2', 'hl-ready'],
      // pb-fp-other: processor B's batch on their farm; pb-fp: their own.
      batches: ['pb-fp', 'pb-fp-other'],
      parchment: ['pl-fp', 'pl-fp-other'],
      green: ['gbl-fp'],
      pricing: ['ph-fp'],
    })
  })

  test("a Farmer+Processor still gets 403 on another processor's batch elsewhere", async () => {
    expect((await open(farmerProcessor, 'batch', 'pb-a')).status).toBe(403)
  })

  test('a Processor+Roaster gets their own lots and the shelf', async () => {
    const lists = await listAll(user('proc-a', ['Processor', 'Roaster']))
    expect(lists.green).toEqual(['gbl-a', 'gbl-a-shelf'])
    expect(lists.batches).toEqual(['pb-a'])
  })
})

describe('Admins and the cupping roles', () => {
  test.each([
    ['an Admin', admin],
    ['a super admin with no roles', superAdmin],
    ['a Farmer who is a super admin', user('farmer-1', ['Farmer'], true)],
    ['a Cupper (as before; cupping is hands-off)', cupper],
    ['a HeadJudge (as before; cupping is hands-off)', headJudge],
  ])('%s sees everything', async (_label, viewer) => {
    expect(await listAll(viewer)).toEqual(everything())
    expect(mockPrisma.farm.findMany).not.toHaveBeenCalled()
  })

  test.each([
    ['batch', 'pb-b'],
    ['parchment', 'pl-ext-old'],
    ['green', 'gbl-ext-rb'],
    ['harvest', 'hl-fp'],
  ] as [Kind, string][])('an Admin opens any %s without a scope lookup', async (kind, id) => {
    expect((await open(admin, kind, id)).status).toBe(200)
    for (const model of ['harvestLot', 'processingBatch', 'parchmentLot', 'greenBeanLot']) {
      expect(mockPrisma[model].findFirst).not.toHaveBeenCalled()
    }
  })
})

describe('a user with no role', () => {
  test('reads nothing of the chain', async () => {
    expect(await listAll(noRole)).toEqual({ harvest: [], batches: [], parchment: [], green: [], pricing: [] })
    expect((await open(noRole, 'green', 'gbl-a-shelf')).status).toBe(403)
  })
})

describe('lib/farmAccess', () => {
  test('chainScope is null for Admins, super admins, HeadJudges and Cuppers', async () => {
    const { chainScope } = await import('@/lib/farmAccess')
    for (const viewer of [admin, superAdmin, cupper, headJudge, user('x', ['Processor', 'Cupper'])]) {
      expect(await chainScope(viewer as any)).toBeNull()
    }
  })

  test('canClaimGreenBeanLot refuses only another user\'s bought-in lot, and never an Admin', async () => {
    const { canClaimGreenBeanLot } = await import('@/lib/farmAccess')
    expect(canClaimGreenBeanLot(roasterA as any, { sourceType: 'Internal', createdById: 'proc-a' })).toBe(true)
    expect(canClaimGreenBeanLot(roasterA as any, { sourceType: 'External', createdById: 'roaster-a' })).toBe(true)
    expect(canClaimGreenBeanLot(roasterA as any, { sourceType: 'External', createdById: 'roaster-b' })).toBe(false)
    expect(canClaimGreenBeanLot(roasterA as any, { sourceType: 'External', createdById: null })).toBe(false)
    expect(canClaimGreenBeanLot(admin as any, { sourceType: 'External', createdById: 'roaster-b' })).toBe(true)
  })

  test('requireInScope throws the 403 error unless the lookup found the record', async () => {
    const { requireInScope } = await import('@/lib/farmAccess')
    expect(() => requireInScope({ id: 'x' })).not.toThrow()
    expect(() => requireInScope(null)).toThrow('Insufficient permissions')
  })
})
