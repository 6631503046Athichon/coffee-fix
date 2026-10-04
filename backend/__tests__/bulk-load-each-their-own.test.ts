/**
 * Owner decision 2026-10-05, "each their own" (ของใครของมัน), on the loads
 * every screen starts from:
 * - bulk-load phase 1 harvest lots and phase 2 batches, parchment and green
 *   beans hold the same rows as the list routes (lib/farmAccess chainScope):
 *   a processor their own chain plus Ready cherry, a roaster their green beans
 *   and the shelf with the parchment and cherry behind them and no batches, a
 *   farmer (collaborators included) their farms' chain, several roles the
 *   union, Admin everything
 * - a roaster's stock rows name only the withdrawals that went into their
 *   stock, not another buyer's kg and dates
 * - crop years carry lot and batch counts for Admins only
 * - data-version stamps cover only what the caller can list, so another
 *   user's work (or login) never moves them
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
    withdrawalHistory: many('parchmentWithdrawal', 'parchmentLotId'),
  },
  greenBeanLot: {
    parchmentLot: one('parchmentLot', 'parchmentLotId'),
    roasterInventory: many('roasterInventoryItem', 'greenBeanLotId'),
    roastBatches: many('roastBatch', 'greenBeanLotId'),
    withdrawalHistory: many('greenBeanWithdrawal', 'greenBeanLotId'),
  },
  greenBeanWithdrawal: { greenBeanLot: one('greenBeanLot', 'greenBeanLotId') },
  parchmentWithdrawal: { parchmentLot: one('parchmentLot', 'parchmentLotId') },
  pricingHistory: { greenBeanLot: one('greenBeanLot', 'greenBeanLotId') },
  roasterInventoryItem: {
    greenBeanLot: one('greenBeanLot', 'greenBeanLotId'),
    roastBatches: many('roastBatch', 'roasterInventoryId'),
  },
  roastBatch: {
    greenBeanLot: one('greenBeanLot', 'greenBeanLotId'),
    roasterInventory: one('roasterInventoryItem', 'roasterInventoryId'),
  },
  invoice: { saleOrder: one('saleOrder', 'saleOrderId') },
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
const farmerRoaster = user('fr-1', ['Farmer', 'Roaster'])
const admin = user('admin-1', ['Admin'])
const superAdmin = user('super-1', [], true)
const cupper = user('cupper-1', ['Cupper'])
const noRole = user('nobody-1', [])

// ---- the store --------------------------------------------------------------

const day = (n: number) => new Date(Date.UTC(2026, 8, n))

const seed = (): Record<string, Row[]> => ({
  farm: [
    { id: 'farm-1', ownerId: 'farmer-1', farmName: 'Doi Farm', location: 'Chiang Rai', updatedAt: day(1) },
    { id: 'farm-3', ownerId: 'farmer-3', farmName: 'Mae Farm', location: 'Nan', updatedAt: day(1) },
    { id: 'farm-fp', ownerId: 'fp-1', farmName: 'Mill Farm', location: 'Lampang', updatedAt: day(1) },
    { id: 'farm-fr', ownerId: 'fr-1', farmName: 'Roast Farm', location: 'Phrae', updatedAt: day(1) },
  ],
  // Farmer 2 helps on farmer 1's farm.
  farmCollaborator: [{ id: 'fc-1', farmId: 'farm-1', userId: 'farmer-2' }],
  harvestLot: [
    // Recorded for farmer 1 by an Admin: the collaborator still reads it.
    { id: 'hl-a', farmId: 'farm-1', createdById: 'admin-1', status: 'Complete', weightKg: 100, cropYearId: 'cy-1', updatedAt: day(2) },
    { id: 'hl-b', farmId: 'farm-3', createdById: 'farmer-3', status: 'Complete', weightKg: 100, cropYearId: 'cy-1', updatedAt: day(2) },
    { id: 'hl-ready', farmId: 'farm-3', createdById: 'farmer-3', status: 'ReadyForProcessing', weightKg: 80, cropYearId: 'cy-1', updatedAt: day(2) },
    // The Farmer+Processor's own farm, processed by processor B.
    { id: 'hl-fp', farmId: 'farm-fp', createdById: 'fp-1', status: 'Complete', weightKg: 60, cropYearId: 'cy-1', updatedAt: day(2) },
    // Farmer 3's cherry, processed by the Farmer+Processor.
    { id: 'hl-fp2', farmId: 'farm-3', createdById: 'farmer-3', status: 'Complete', weightKg: 50, cropYearId: 'cy-1', updatedAt: day(2) },
    // The Farmer+Roaster's own cherry, not yet processed.
    { id: 'hl-fr', farmId: 'farm-fr', createdById: 'fr-1', status: 'ReadyForProcessing', weightKg: 40, cropYearId: 'cy-1', updatedAt: day(2) },
  ],
  processingBatch: [
    { id: 'pb-a', harvestLotId: 'hl-a', createdById: 'proc-a', processType: 'Washed', cropYearId: 'cy-1', updatedAt: day(3) },
    { id: 'pb-b', harvestLotId: 'hl-b', createdById: 'proc-b', processType: 'Natural', cropYearId: 'cy-1', updatedAt: day(3) },
    { id: 'pb-fp-other', harvestLotId: 'hl-fp', createdById: 'proc-b', processType: 'Honey', cropYearId: 'cy-1', updatedAt: day(3) },
    { id: 'pb-fp', harvestLotId: 'hl-fp2', createdById: 'fp-1', processType: 'Washed', cropYearId: 'cy-1', updatedAt: day(3) },
  ],
  parchmentLot: [
    { id: 'pl-a', processingBatchId: 'pb-a', harvestLotId: 'hl-a', sourceType: 'Internal', processType: 'Washed', updatedAt: day(4) },
    { id: 'pl-b', processingBatchId: 'pb-b', harvestLotId: 'hl-b', sourceType: 'Internal', processType: 'Natural', updatedAt: day(4) },
    { id: 'pl-fp-other', processingBatchId: 'pb-fp-other', harvestLotId: 'hl-fp', sourceType: 'Internal', processType: 'Honey', updatedAt: day(4) },
    { id: 'pl-fp', processingBatchId: 'pb-fp', harvestLotId: 'hl-fp2', sourceType: 'Internal', processType: 'Washed', updatedAt: day(4) },
    // Bought in from an Excel sheet by processor A.
    {
      id: 'pl-ext-a', processingBatchId: null, harvestLotId: null, sourceType: 'External', processType: 'Washed',
      externalSource: { code: 'X-1', importedBy: 'proc-a' }, updatedAt: day(4),
    },
    // Bought in before the importer was recorded: Admin-only.
    {
      id: 'pl-ext-old', processingBatchId: null, harvestLotId: null, sourceType: 'External', processType: 'Natural',
      externalSource: { code: 'X-0' }, updatedAt: day(4),
    },
  ],
  greenBeanLot: [
    { id: 'gbl-a', parchmentLotId: 'pl-a', createdById: 'proc-a', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0, updatedAt: day(5) },
    { id: 'gbl-a-shelf', parchmentLotId: 'pl-a', createdById: 'proc-a', sourceType: 'Internal', availabilityStatus: 'Available', currentWeightKg: 30, updatedAt: day(5) },
    { id: 'gbl-b', parchmentLotId: 'pl-b', createdById: 'proc-b', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0, updatedAt: day(5) },
    { id: 'gbl-b-held', parchmentLotId: 'pl-b', createdById: 'proc-b', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0, updatedAt: day(5) },
    // Available with kg left, but bought in by a roaster: theirs alone.
    { id: 'gbl-ext-ra', parchmentLotId: null, createdById: 'roaster-a', sourceType: 'External', availabilityStatus: 'Available', currentWeightKg: 20, updatedAt: day(5) },
    { id: 'gbl-ext-rb', parchmentLotId: null, createdById: 'roaster-b', sourceType: 'External', availabilityStatus: 'Available', currentWeightKg: 20, updatedAt: day(5) },
    { id: 'gbl-fp', parchmentLotId: 'pl-fp', createdById: 'fp-1', sourceType: 'Internal', availabilityStatus: 'Withdrawn', currentWeightKg: 0, updatedAt: day(5) },
  ],
  // Lot gbl-b-held went to two roasters; one withdrawal to roaster A was voided.
  greenBeanWithdrawal: [
    { id: 'gw-ra', greenBeanLotId: 'gbl-b-held', withdrawalType: 'RoastingStock', amountKg: 10, targetRoasterId: 'roaster-a', voidedAt: null, date: day(6) },
    { id: 'gw-rb', greenBeanLotId: 'gbl-b-held', withdrawalType: 'Sale', amountKg: 7, targetRoasterId: 'roaster-b', voidedAt: null, date: day(7) },
    { id: 'gw-ra-void', greenBeanLotId: 'gbl-b-held', withdrawalType: 'RoastingStock', amountKg: 3, targetRoasterId: 'roaster-a', voidedAt: day(8), date: day(8) },
    { id: 'gw-b', greenBeanLotId: 'gbl-b', withdrawalType: 'RoastingStock', amountKg: 5, targetRoasterId: 'roaster-b', voidedAt: null, date: day(6) },
  ],
  // Parchment pl-b (behind roaster A's held lot) went partly to roaster A's
  // stock and partly to a customer; processor A's import was sold.
  parchmentWithdrawal: [
    { id: 'pw-ra', parchmentLotId: 'pl-b', withdrawalType: 'RoastingStock', amountKg: 4, targetRoasterId: 'roaster-a', voidedAt: null, date: day(6) },
    { id: 'pw-sale', parchmentLotId: 'pl-b', withdrawalType: 'Sale', amountKg: 6, targetRoasterId: null, voidedAt: null, date: day(7) },
    { id: 'pw-ext', parchmentLotId: 'pl-ext-a', withdrawalType: 'Sale', amountKg: 2, targetRoasterId: null, voidedAt: null, date: day(7) },
  ],
  roasterInventoryItem: [
    { id: 'inv-ra', roasterId: 'roaster-a', greenBeanLotId: 'gbl-b-held', updatedAt: day(9) },
    { id: 'inv-rb', roasterId: 'roaster-b', greenBeanLotId: 'gbl-b-held', updatedAt: day(9) },
  ],
  roastBatch: [{ id: 'rb-1', roasterId: 'roaster-b', greenBeanLotId: 'gbl-b', roasterInventoryId: 'inv-rb', updatedAt: day(9) }],
  pricingHistory: [
    { id: 'ph-a', greenBeanLotId: 'gbl-a', createdAt: day(10) },
    { id: 'ph-a-shelf', greenBeanLotId: 'gbl-a-shelf', createdAt: day(10) },
    { id: 'ph-b', greenBeanLotId: 'gbl-b', createdAt: day(10) },
    { id: 'ph-b-held', greenBeanLotId: 'gbl-b-held', createdAt: day(10) },
    { id: 'ph-ext-ra', greenBeanLotId: 'gbl-ext-ra', createdAt: day(10) },
    { id: 'ph-fp', greenBeanLotId: 'gbl-fp', createdAt: day(10) },
  ],
  soilAnalysis: [
    { id: 's-1', farmId: 'farm-1', updatedAt: day(11) },
    { id: 's-3', farmId: 'farm-3', updatedAt: day(11) },
  ],
  weatherRecord: [
    { id: 'w-1', farmId: 'farm-1', updatedAt: day(11) },
    { id: 'w-3', farmId: 'farm-3', updatedAt: day(11) },
  ],
  gAPLogEntry: [
    { id: 'g-1', farmId: 'farm-1', updatedAt: day(11) },
    { id: 'g-3', farmId: 'farm-3', updatedAt: day(11) },
  ],
  cropYear: [{ id: 'cy-1', year: '2026/2027', startDate: day(1), description: null, updatedAt: day(1) }],
  processType: [],
  activityType: [],
  coffeeGrade: [],
  customer: [],
  saleOrder: [],
  invoice: [],
  user: [procA, procB, roasterA, roasterB, owner, collaborator, farmerProcessor, admin].map(u => ({
    id: u.id, name: u.name, roles: u.roles, isActive: true, lastLogin: day(1), updatedAt: day(1),
  })),
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

// Rows come back whole, with the relations the route includes attached, and
// `_count` where a route asks for it.
function shape(model: string, row: Row, include?: Row): Row {
  const out: Row = { ...row }
  if (model === 'harvestLot') {
    out._count = { processingBatches: (related(model, 'processingBatches', row) as Row[]).length }
  }
  for (const [key, spec] of Object.entries(include ?? {})) {
    if (key === '_count' && model === 'cropYear') {
      out._count = {
        harvestLots: tables.harvestLot.filter(r => r.cropYearId === row.id).length,
        processingBatches: tables.processingBatch.filter(r => r.cropYearId === row.id).length,
      }
      continue
    }
    const rel = RELATIONS[model]?.[key]
    if (!rel || !spec) continue
    const nested = typeof spec === 'object' ? (spec as Row) : {}
    if (rel.kind === 'one') {
      const target = related(model, key, row) as Row | null
      out[key] = target ? shape(rel.model, target, nested.include) : null
    } else {
      out[key] = (related(model, key, row) as Row[])
        .filter(r => matches(rel.model, r, nested.where))
        .map(r => shape(rel.model, r, nested.include))
    }
  }
  return out
}

// A top-level select keeps only the scalar columns it names.
function project(row: Row, select?: Row): Row {
  if (!select) return row
  return Object.fromEntries(Object.keys(select).filter(key => select[key] === true).map(key => [key, row[key]]))
}

const sortValue = (value: unknown) => (value instanceof Date ? value.getTime() : (value as any))

function find(model: string, args: Row = {}): Row[] {
  let rows = tables[model].filter(r => matches(model, r, args.where))
  const order = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy
  if (order) {
    const [[key, direction]] = Object.entries(order as Row)
    const sign = direction === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => (sortValue(a[key]) > sortValue(b[key]) ? sign : sortValue(a[key]) < sortValue(b[key]) ? -sign : 0))
  }
  if (typeof args.skip === 'number') rows = rows.slice(args.skip)
  if (typeof args.take === 'number') rows = rows.slice(0, args.take)
  return rows.map(r => project(shape(model, r, args.include), args.select))
}

const delegate = (model: string) => ({
  findMany: jest.fn(async (args: any = {}) => find(model, args)),
  findFirst: jest.fn(async (args: any = {}) => find(model, args)[0] ?? null),
  findUnique: jest.fn(async (args: any) => find(model, args)[0] ?? null),
  count: jest.fn(async (args: any = {}) => tables[model].filter(r => matches(model, r, args.where)).length),
})

const MODELS = [
  'farm', 'harvestLot', 'processingBatch', 'parchmentLot', 'greenBeanLot', 'pricingHistory',
  'roasterInventoryItem', 'roastBatch', 'soilAnalysis', 'weatherRecord', 'gAPLogEntry', 'cropYear',
  'processType', 'activityType', 'coffeeGrade', 'customer', 'saleOrder', 'invoice', 'user',
]
const mockPrisma: any = Object.fromEntries(MODELS.map(model => [model, delegate(model)]))

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Crop-year upkeep writes rows; crop-year-rollover.test.ts covers it.
jest.mock('@/lib/cropYears', () => ({
  upkeepCropYears: jest.fn(async () => false),
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

const request = (url: string) => new NextRequest(`http://localhost:3001${url}`)
const ids = (rows: Row[]) => rows.map(r => r.id).sort()

async function json(response: Response) {
  expect(response.status).toBe(200)
  return response.json()
}

async function bulkLoad(viewer: any, phase: 1 | 2) {
  mockAuthUser = viewer
  const { GET } = await import('@/app/api/bulk-load/route')
  return json(await GET(request(`/api/bulk-load?phase=${phase}`)))
}

type Chain = { harvest: string[]; batches: string[]; parchment: string[]; green: string[] }

/** The lot chain bulk-load hands `viewer`, as sorted ids. */
async function loadChain(viewer: any): Promise<Chain> {
  const phase1 = await bulkLoad(viewer, 1)
  const phase2 = await bulkLoad(viewer, 2)
  return {
    harvest: ids(phase1.harvestLots),
    batches: ids(phase2.processingBatches),
    parchment: ids(phase2.parchmentLots),
    green: ids(phase2.greenBeanLots),
  }
}

/** The lot chain the list routes hand `viewer`, as sorted ids. */
async function listChain(viewer: any): Promise<Chain> {
  mockAuthUser = viewer
  const harvest = await import('@/app/api/harvest-lots/route')
  const batches = await import('@/app/api/processing-batches/route')
  const parchment = await import('@/app/api/parchment-lots/route')
  const green = await import('@/app/api/green-bean-lots/route')
  return {
    harvest: ids((await json(await harvest.GET(request('/api/harvest-lots?limit=1000')))).harvestLots),
    batches: ids((await json(await batches.GET(request('/api/processing-batches?limit=1000')))).processingBatches),
    parchment: ids((await json(await parchment.GET(request('/api/parchment-lots?limit=1000')))).parchmentLots),
    green: ids((await json(await green.GET(request('/api/green-bean-lots?limit=1000')))).greenBeanLots),
  }
}

async function versions(viewer: any): Promise<Record<string, string | null>> {
  mockAuthUser = viewer
  const { GET } = await import('@/app/api/data-version/route')
  return json(await GET(request('/api/data-version')))
}

const touch = (model: string, id: string, changes: Row = {}) => {
  const row = tables[model].find(r => r.id === id)
  if (!row) throw new Error(`no ${model} ${id}`)
  Object.assign(row, { updatedAt: day(20) }, changes)
}

// ---- bulk-load: the lot chain -------------------------------------------------

describe('bulk-load hands each user their own lot chain', () => {
  test('a processor gets their batch, its parchment and cherry, their import, their green beans, and Ready cherry', async () => {
    expect(await loadChain(procA)).toEqual({
      // Every Ready lot, the Farmer+Roaster's included.
      harvest: ['hl-a', 'hl-fr', 'hl-ready'],
      batches: ['pb-a'],
      parchment: ['pl-a', 'pl-ext-a'],
      green: ['gbl-a', 'gbl-a-shelf'],
    })
  })

  test('a roaster gets their green beans and the shelf with the parchment and cherry behind them, and no batches', async () => {
    expect(await loadChain(roasterA)).toEqual({
      harvest: ['hl-a', 'hl-b'],
      batches: [],
      parchment: ['pl-a', 'pl-b'],
      // Not roaster B's bought-in lot, though it is Available with kg left.
      green: ['gbl-a-shelf', 'gbl-b-held', 'gbl-ext-ra'],
    })
  })

  test("a farm's collaborator gets the farm's chain, including a lot an Admin recorded for the owner", async () => {
    const expected = {
      harvest: ['hl-a'],
      batches: ['pb-a'],
      parchment: ['pl-a'],
      green: ['gbl-a', 'gbl-a-shelf'],
    }
    expect(await loadChain(collaborator)).toEqual(expected)
    expect(await loadChain(owner)).toEqual(expected)
  })

  test("a Farmer+Processor gets the union: their farm's chain and their own processing chain", async () => {
    expect(await loadChain(farmerProcessor)).toEqual({
      harvest: ['hl-fp', 'hl-fp2', 'hl-fr', 'hl-ready'],
      batches: ['pb-fp', 'pb-fp-other'],
      parchment: ['pl-fp', 'pl-fp-other'],
      green: ['gbl-fp'],
    })
  })

  test("a Farmer+Roaster gets their farm's cherry plus the shelf and its sources", async () => {
    expect(await loadChain(farmerRoaster)).toEqual({
      harvest: ['hl-a', 'hl-fr'],
      batches: [],
      parchment: ['pl-a'],
      green: ['gbl-a-shelf'],
    })
  })

  test.each([
    ['an Admin', admin],
    ['a super admin with no roles', superAdmin],
    ['a Cupper (cupping roles read as before)', cupper],
  ])('%s gets every lot', async (_who, viewer) => {
    expect(await loadChain(viewer)).toEqual({
      harvest: ids(tables.harvestLot),
      batches: ids(tables.processingBatch),
      parchment: ids(tables.parchmentLot),
      green: ids(tables.greenBeanLot),
    })
  })

  test('a user with no role gets no lots', async () => {
    expect(await loadChain(noRole)).toEqual({ harvest: [], batches: [], parchment: [], green: [] })
  })

  test.each([
    ['a processor', procA],
    ['another processor', procB],
    ['a roaster', roasterA],
    ['a farm collaborator', collaborator],
    ['a Farmer+Processor', farmerProcessor],
    ['a Farmer+Roaster', farmerRoaster],
    ['an Admin', admin],
  ])('%s gets the same rows from bulk-load as from the list routes', async (_who, viewer) => {
    expect(await loadChain(viewer)).toEqual(await listChain(viewer))
  })
})

describe("bulk-load: a roaster's stock rows", () => {
  const stockWithdrawals = async (viewer: any) => {
    const { roasterInventory } = await bulkLoad(viewer, 2)
    return roasterInventory.map((item: Row) => [item.id, ids(item.greenBeanLot.withdrawalHistory)])
  }

  test("name only the withdrawals that went into their own stock, not another buyer's kg and dates", async () => {
    expect(await stockWithdrawals(roasterA)).toEqual([['inv-ra', ['gw-ra']]])
    expect(await stockWithdrawals(roasterB)).toEqual([['inv-rb', ['gw-rb']]])
  })

  test('an Admin sees every stock row with every withdrawal that is not void', async () => {
    const rows = await stockWithdrawals(admin)
    expect(rows.map(([id]: [string]) => id).sort()).toEqual(['inv-ra', 'inv-rb'])
    for (const [, withdrawals] of rows) expect(withdrawals).toEqual(['gw-ra', 'gw-rb'])
  })
})

describe("a lot's withdrawal history: a roaster sees only the rows into their own stock", () => {
  /** The withdrawal ids on green lot `lotId`, from bulk-load, the list and the lot itself. */
  const greenHistories = async (viewer: any, lotId: string) => {
    const fromBulkLoad = (await bulkLoad(viewer, 2)).greenBeanLots.find((lot: Row) => lot.id === lotId)
    mockAuthUser = viewer
    const listRoute = await import('@/app/api/green-bean-lots/route')
    const fromList = (await json(await listRoute.GET(request('/api/green-bean-lots?limit=1000'))))
      .greenBeanLots.find((lot: Row) => lot.id === lotId)
    const byIdRoute = await import('@/app/api/green-bean-lots/[id]/route')
    const fromId = (await json(await byIdRoute.GET(request(`/api/green-bean-lots/${lotId}`), { params: Promise.resolve({ id: lotId }) })))
      .greenBeanLot
    return [fromBulkLoad, fromList, fromId].map(lot => ids(lot.withdrawalHistory))
  }

  const parchmentHistory = async (viewer: any, lotId: string) => {
    mockAuthUser = viewer
    const { GET } = await import('@/app/api/parchment-lots/route')
    const lot = (await json(await GET(request('/api/parchment-lots?limit=1000')))).parchmentLots
      .find((row: Row) => row.id === lotId)
    return ids(lot.withdrawalHistory)
  }

  test("roaster A's held lot carries their own withdrawals, not roaster B's kg and date, from every route", async () => {
    // gw-ra-void is roaster A's own, voided: voids stay visible (D7).
    for (const history of await greenHistories(roasterA, 'gbl-b-held')) {
      expect(history).toEqual(['gw-ra', 'gw-ra-void'])
      expect(history).not.toContain('gw-rb')
    }
    for (const history of await greenHistories(roasterB, 'gbl-b-held')) {
      expect(history).toEqual(['gw-rb'])
    }
  })

  test('a shelf lot shows a roaster none of the other buyers\' withdrawals', async () => {
    tables.greenBeanWithdrawal.push({
      id: 'gw-shelf', greenBeanLotId: 'gbl-a-shelf', withdrawalType: 'Sale', amountKg: 2, targetRoasterId: null, voidedAt: null, date: day(9),
    })
    for (const history of await greenHistories(roasterA, 'gbl-a-shelf')) expect(history).toEqual([])
    for (const history of await greenHistories(procA, 'gbl-a-shelf')) expect(history).toEqual(['gw-shelf'])
  })

  test.each([
    ['the processor who owns it', procB],
    ['the farmer whose farm grew it', otherFarmer],
    ['an Admin', admin],
  ])('%s gets every row', async (_who, viewer) => {
    for (const history of await greenHistories(viewer, 'gbl-b-held')) {
      expect(history).toEqual(['gw-ra', 'gw-ra-void', 'gw-rb'])
    }
  })

  test('the parchment behind a held lot shows the roaster only the kg that went into their stock', async () => {
    expect(await parchmentHistory(roasterA, 'pl-b')).toEqual(['pw-ra'])
    expect(await parchmentHistory(procB, 'pl-b')).toEqual(['pw-ra', 'pw-sale'])
    expect(await parchmentHistory(otherFarmer, 'pl-b')).toEqual(['pw-ra', 'pw-sale'])
    expect(await parchmentHistory(admin, 'pl-b')).toEqual(['pw-ra', 'pw-sale'])
    // The processor who imported bought-in parchment reads its rows too.
    expect(await parchmentHistory(procA, 'pl-ext-a')).toEqual(['pw-ext'])
  })
})

// ---- crop years -------------------------------------------------------------

describe('crop years carry lot and batch counts for Admins only', () => {
  const nonAdmins: [string, any][] = [
    ['a processor', procA],
    ['a roaster', roasterA],
    ['a farm collaborator', collaborator],
    ['a Farmer+Processor', farmerProcessor],
  ]
  const admins: [string, any][] = [
    ['an Admin', admin],
    ['a super admin', superAdmin],
  ]

  const listed = async (viewer: any) => {
    mockAuthUser = viewer
    const { GET } = await import('@/app/api/crop-years/route')
    return (await json(await GET(request('/api/crop-years')))).cropYears
  }
  const opened = async (viewer: any) => {
    mockAuthUser = viewer
    const { GET } = await import('@/app/api/crop-years/[id]/route')
    return (await json(await GET(request('/api/crop-years/cy-1'), { params: Promise.resolve({ id: 'cy-1' }) }))).cropYear
  }

  test.each(nonAdmins)('%s gets crop years without the counts, from every route', async (_who, viewer) => {
    const [fromList] = await listed(viewer)
    const fromBulkLoad = (await bulkLoad(viewer, 1)).cropYears[0]
    const fromId = await opened(viewer)
    for (const cropYear of [fromList, fromBulkLoad, fromId]) {
      expect(cropYear).toMatchObject({ id: 'cy-1', year: '2026/2027' })
      expect(cropYear).not.toHaveProperty('_count')
    }
  })

  test.each(admins)('%s gets the counts', async (_who, viewer) => {
    const counts = { harvestLots: 6, processingBatches: 4 }
    expect((await listed(viewer))[0]._count).toEqual(counts)
    expect((await bulkLoad(viewer, 1)).cropYears[0]._count).toEqual(counts)
    expect((await opened(viewer))._count).toEqual(counts)
  })
})

// ---- data-version -------------------------------------------------------------

describe('data-version stamps cover only what the caller can list', () => {
  // Every stamp below is a real one, so "unchanged" never means "failed".
  test.each([
    ['an Admin', admin, []],
    ['a roaster', roasterA, []],
    ['a processor', procA, ['saleOrders', 'invoices', 'roasterInventory', 'roastBatches']],
    ['a farmer', collaborator, ['customers', 'saleOrders', 'invoices', 'roasterInventory', 'roastBatches']],
  ])('%s gets a stamp for every list they load', async (_who, viewer, none) => {
    const stamps = await versions(viewer)
    const empty = Object.keys(stamps).filter(key => stamps[key] === null).sort()
    // Empty tables stamped by their newest row alone come back null for
    // everyone; counted stamps are a hash even over no rows.
    const emptyTables = ['processTypes', 'activityTypes', 'coffeeGrades', 'invoices']
    expect(empty).toEqual([...new Set([...(none as string[]), ...emptyTables])].sort())
  })

  test("another processor's batch, parchment and green beans never move a processor's stamps; their own do", async () => {
    const before = await versions(procA)
    touch('processingBatch', 'pb-b')
    touch('parchmentLot', 'pl-b')
    touch('greenBeanLot', 'gbl-b')
    tables.pricingHistory.push({ id: 'ph-b2', greenBeanLotId: 'gbl-b', createdAt: day(20) })
    const after = await versions(procA)
    for (const key of ['processingBatches', 'parchmentLots', 'greenBeanLots', 'pricingHistory', 'harvestLots']) {
      expect([key, after[key]]).toEqual([key, before[key]])
    }

    touch('processingBatch', 'pb-a')
    tables.pricingHistory.push({ id: 'ph-a2', greenBeanLotId: 'gbl-a', createdAt: day(21) })
    const own = await versions(procA)
    expect(own.processingBatches).not.toBe(after.processingBatches)
    expect(own.pricingHistory).not.toBe(after.pricingHistory)

    // An Admin's stamps cover every row.
    const adminBefore = await versions(admin)
    touch('processingBatch', 'pb-b', { updatedAt: day(22) })
    expect((await versions(admin)).processingBatches).not.toBe(adminBefore.processingBatches)
  })

  test('Ready cherry another processor takes moves every processor\'s harvest stamp, so it leaves their list', async () => {
    const before = await versions(procA)
    // Processor B batches the Ready lot: it is no longer Ready, and not A's.
    tables.processingBatch.push({ id: 'pb-new', harvestLotId: 'hl-ready', createdById: 'proc-b', cropYearId: 'cy-1', updatedAt: day(20) })
    const after = await versions(procA)
    expect(after.harvestLots).not.toBe(before.harvestLots)
  })

  test("a roaster's green-bean stamp moves for the shelf, not for another roaster's bought-in lot", async () => {
    const before = await versions(roasterA)
    touch('greenBeanLot', 'gbl-ext-rb')
    touch('greenBeanLot', 'gbl-a')
    expect((await versions(roasterA)).greenBeanLots).toBe(before.greenBeanLots)
    touch('greenBeanLot', 'gbl-a-shelf', { updatedAt: day(21) })
    expect((await versions(roasterA)).greenBeanLots).not.toBe(before.greenBeanLots)
  })

  test("a roaster's price stamp covers the lots they bought in or hold, not the shelf", async () => {
    const before = await versions(roasterA)
    tables.pricingHistory.push({ id: 'ph-shelf2', greenBeanLotId: 'gbl-a-shelf', createdAt: day(20) })
    expect((await versions(roasterA)).pricingHistory).toBe(before.pricingHistory)
    tables.pricingHistory.push({ id: 'ph-held2', greenBeanLotId: 'gbl-b-held', createdAt: day(21) })
    expect((await versions(roasterA)).pricingHistory).not.toBe(before.pricingHistory)
  })

  test("a roaster's stock and roast stamps are their own; other roles get none", async () => {
    const before = await versions(roasterA)
    touch('roasterInventoryItem', 'inv-rb')
    touch('roastBatch', 'rb-1')
    const after = await versions(roasterA)
    expect(after.roasterInventory).toBe(before.roasterInventory)
    expect(after.roastBatches).toBe(before.roastBatches)

    const processorStamps = await versions(procA)
    expect(processorStamps.roasterInventory).toBeNull()
    expect(processorStamps.roastBatches).toBeNull()
  })

  test("a farm collaborator's stamps move with the shared farm, not with other farms", async () => {
    const before = await versions(collaborator)
    touch('harvestLot', 'hl-b')
    touch('farm', 'farm-3')
    touch('soilAnalysis', 's-3')
    touch('weatherRecord', 'w-3')
    touch('gAPLogEntry', 'g-3')
    const after = await versions(collaborator)
    for (const key of ['harvestLots', 'farms', 'soilAnalyses', 'weatherRecords', 'gapLogs']) {
      expect([key, after[key]]).toEqual([key, before[key]])
    }

    touch('harvestLot', 'hl-a', { updatedAt: day(21) })
    touch('soilAnalysis', 's-1', { updatedAt: day(21) })
    const shared = await versions(collaborator)
    expect(shared.harvestLots).not.toBe(after.harvestLots)
    expect(shared.soilAnalyses).not.toBe(after.soilAnalyses)
  })

  test("a Farmer+Processor's stamps cover the union of their farm's chain and their own processing", async () => {
    const before = await versions(farmerProcessor)
    // Processor B's batch on the Farmer+Processor's own farm.
    touch('processingBatch', 'pb-fp-other')
    const afterFarm = await versions(farmerProcessor)
    expect(afterFarm.processingBatches).not.toBe(before.processingBatches)
    // Processor A's batch on farmer 1's farm: neither theirs nor their farm's.
    touch('processingBatch', 'pb-a', { updatedAt: day(21) })
    expect((await versions(farmerProcessor)).processingBatches).toBe(afterFarm.processingBatches)
  })

  describe('the users stamp', () => {
    const logIn = (id: string, when: Date) => {
      const row = tables.user.find(r => r.id === id)!
      // Prisma's @updatedAt moves with lastLogin.
      Object.assign(row, { lastLogin: when, updatedAt: when })
    }

    test.each([
      ['a processor', procA],
      ['a roaster', roasterA],
      ['a farmer', collaborator],
    ])("does not move for %s when someone else logs in, so it never tells them when", async (_who, viewer) => {
      const before = await versions(viewer)
      logIn('proc-b', day(20))
      logIn('farmer-1', day(21))
      expect((await versions(viewer)).users).toBe(before.users)
    })

    test('moves for a non-Admin when the names, roles or active users they list change', async () => {
      const before = await versions(procA)
      tables.user.find(r => r.id === 'roaster-b')!.name = 'Roaster Bee'
      const renamed = await versions(procA)
      expect(renamed.users).not.toBe(before.users)

      tables.user.find(r => r.id === 'roaster-b')!.roles = ['Roaster', 'Processor']
      const newRole = await versions(procA)
      expect(newRole.users).not.toBe(renamed.users)

      tables.user.find(r => r.id === 'roaster-b')!.isActive = false
      expect((await versions(procA)).users).not.toBe(newRole.users)
    })

    test('an Admin, who lists last logins, still gets a stamp that moves with them', async () => {
      const before = await versions(admin)
      logIn('proc-b', day(20))
      expect((await versions(admin)).users).not.toBe(before.users)
    })
  })
})
