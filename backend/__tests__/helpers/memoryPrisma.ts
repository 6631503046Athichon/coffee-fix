/**
 * A small in-memory stand-in for the Prisma client, for route tests where
 * the outcome (kg on a lot, a roaster's stock row, which rows exist) matters
 * more than the exact calls.
 *
 * It covers what the withdrawal routes use: findUnique / findFirst / findMany
 * / count, create / update / updateMany / delete / deleteMany, simple where
 * filters (equality, null, gte / gt / lte / lt, in, not, startsWith, the
 * roasterId_greenBeanLotId compound key, and none / some / every on the
 * list relations below), select / include with those relations, `_count`
 * (filtered with `where` too), orderBy and take. Deleting a lot takes its
 * withdrawals with it, as the schema cascades them. An unknown relation or
 * filter throws, so a route that needs more fails loudly instead of passing
 * by accident.
 *
 * `client` is what `@/lib/prisma` should return: reads and `$transaction`
 * only, so a write that escaped the transaction fails the test. The
 * transaction callback gets `tx`, which can also write and `$queryRaw` (row
 * locks are recorded in `locks` and return no rows). A callback that throws
 * leaves the tables as they were, like a rolled-back transaction.
 */

type Row = Record<string, any>

type Relation = { model: string; kind: 'one' | 'many'; local: string; foreign: string }

const many = (model: string, foreign: string): Relation => ({ model, kind: 'many', local: 'id', foreign })
const one = (model: string, local: string): Relation => ({ model, kind: 'one', local, foreign: 'id' })

const RELATIONS: Record<string, Record<string, Relation>> = {
  processingBatch: {
    parchmentLots: many('parchmentLot', 'processingBatchId'),
  },
  parchmentLot: {
    processingBatch: one('processingBatch', 'processingBatchId'),
    withdrawalHistory: many('parchmentWithdrawal', 'parchmentLotId'),
    greenBeanLots: many('greenBeanLot', 'parchmentLotId'),
  },
  greenBeanLot: {
    parchmentLot: one('parchmentLot', 'parchmentLotId'),
    withdrawalHistory: many('greenBeanWithdrawal', 'greenBeanLotId'),
    roasterInventory: many('roasterInventoryItem', 'greenBeanLotId'),
    roastBatches: many('roastBatch', 'greenBeanLotId'),
    saleOrderItems: many('saleOrderItem', 'greenBeanLotId'),
    invoiceItems: many('invoiceItem', 'greenBeanLotId'),
    cuppingSamples: many('cuppingSample', 'greenBeanLotId'),
    cuppingScores: many('cuppingScore', 'greenBeanLotId'),
    pricingHistory: many('pricingHistory', 'greenBeanLotId'),
  },
  greenBeanWithdrawal: {
    greenBeanLot: one('greenBeanLot', 'greenBeanLotId'),
    withdrawnByUser: one('user', 'withdrawnBy'),
    voidedByUser: one('user', 'voidedById'),
  },
  parchmentWithdrawal: {
    parchmentLot: one('parchmentLot', 'parchmentLotId'),
    withdrawnByUser: one('user', 'withdrawnBy'),
    voidedByUser: one('user', 'voidedById'),
  },
  roasterInventoryItem: {
    roaster: one('user', 'roasterId'),
    greenBeanLot: one('greenBeanLot', 'greenBeanLotId'),
  },
}

// Compound unique keys Prisma exposes as one where field.
const COMPOUND_KEYS: Record<string, string[]> = {
  roasterId_greenBeanLotId: ['roasterId', 'greenBeanLotId'],
}

export const MODELS = [
  'user',
  'harvestLot',
  'processingBatch',
  'dryingLogEntry',
  'parchmentLot',
  'parchmentWithdrawal',
  'greenBeanLot',
  'greenBeanWithdrawal',
  'roasterInventoryItem',
  'roastBatch',
  'saleOrderItem',
  'invoiceItem',
  'cuppingSample',
  'cuppingScore',
  'pricingHistory',
] as const

export type ModelName = (typeof MODELS)[number]
export type Tables = Record<ModelName, Row[]>

const emptyTables = (): Tables =>
  Object.fromEntries(MODELS.map(model => [model, [] as Row[]])) as Tables

const isPlainObject = (v: unknown): v is Row =>
  !!v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)

// What Prisma.join / Prisma.sql hand to a tagged $queryRaw.
const isSqlFragment = (v: unknown): v is { strings: string[]; values: unknown[] } =>
  !!v && typeof v === 'object' && Array.isArray((v as Row).strings) && Array.isArray((v as Row).values)

const comparable = (v: unknown) => (v instanceof Date ? v.getTime() : v)

function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond === null) return actual === null || actual === undefined
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime()
  if (!isPlainObject(cond)) return actual === cond
  for (const [op, operand] of Object.entries(cond)) {
    if (operand === undefined) continue
    const a = comparable(actual) as any
    const b = comparable(operand) as any
    switch (op) {
      case 'equals':
        if (!matchValue(actual, operand)) return false
        break
      case 'not':
        if (matchValue(actual, operand)) return false
        break
      case 'in':
        if (!(operand as unknown[]).some(v => matchValue(actual, v))) return false
        break
      case 'gte':
        if (a === null || a === undefined || !(a >= b)) return false
        break
      case 'gt':
        if (a === null || a === undefined || !(a > b)) return false
        break
      case 'lte':
        if (a === null || a === undefined || !(a <= b)) return false
        break
      case 'lt':
        if (a === null || a === undefined || !(a < b)) return false
        break
      case 'startsWith':
        if (typeof actual !== 'string' || !actual.startsWith(operand as string)) return false
        break
      default:
        throw new Error(`memoryPrisma: unsupported filter "${op}"`)
    }
  }
  return true
}

export function createMemoryPrisma() {
  let tables = emptyTables()
  let nextId = 1
  const locks: string[] = []

  const relationOf = (model: string, key: string) => RELATIONS[model]?.[key]

  function matches(model: string, row: Row, where: Row | undefined): boolean {
    if (!where) return true
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue
      if (key === 'AND') {
        if (!(cond as Row[]).every(part => matches(model, row, part))) return false
        continue
      }
      if (key === 'OR') {
        if (!(cond as Row[]).some(part => matches(model, row, part))) return false
        continue
      }
      if (COMPOUND_KEYS[key]) {
        if (!COMPOUND_KEYS[key].every(field => matchValue(row[field], (cond as Row)[field]))) return false
        continue
      }
      const rel = relationOf(model, key)
      if (rel) {
        if (!matchesRelation(model, key, row, cond)) return false
        continue
      }
      if (!matchValue(row[key], cond)) return false
    }
    return true
  }

  // none / some / every on a list relation, e.g. withdrawalHistory: { none: {} }.
  function matchesRelation(model: string, key: string, row: Row, cond: unknown): boolean {
    const rel = relationOf(model, key)!
    const ops = isPlainObject(cond) ? Object.keys(cond) : []
    if (rel.kind !== 'many' || ops.length === 0 || ops.some(op => !['none', 'some', 'every'].includes(op))) {
      throw new Error(`memoryPrisma: relation filter "${model}.${key}" not supported`)
    }
    const list = related(model, key, row) as Row[]
    const filter = cond as Row
    if (filter.none && list.some(r => matches(rel.model, r, filter.none))) return false
    if (filter.some && !list.some(r => matches(rel.model, r, filter.some))) return false
    if (filter.every && !list.every(r => matches(rel.model, r, filter.every))) return false
    return true
  }

  function related(model: string, key: string, row: Row): Row | Row[] | null {
    const rel = relationOf(model, key)
    if (!rel) throw new Error(`memoryPrisma: unknown relation "${model}.${key}"`)
    const pool = tables[rel.model as ModelName]
    if (rel.kind === 'one') {
      const value = row[rel.local]
      if (value === null || value === undefined) return null
      return pool.find(r => r[rel.foreign] === value) ?? null
    }
    return pool.filter(r => r[rel.foreign] === row[rel.local])
  }

  function sortRows(rows: Row[], orderBy: unknown): Row[] {
    if (!orderBy) return rows
    const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Row[]
    return [...rows].sort((x, y) => {
      for (const key of keys) {
        const [field, dir] = Object.entries(key)[0]
        const a = comparable(x[field]) as any
        const b = comparable(y[field]) as any
        if (a === b) continue
        const order = a < b ? -1 : 1
        return dir === 'desc' ? -order : order
      }
      return 0
    })
  }

  function projectRelation(model: string, key: string, row: Row, spec: unknown) {
    const rel = relationOf(model, key)!
    const value = related(model, key, row)
    const args = isPlainObject(spec) ? spec : {}
    if (rel.kind === 'one') return value ? project(rel.model, value as Row, args) : null
    let list = (value as Row[]).filter(r => matches(rel.model, r, args.where))
    list = sortRows(list, args.orderBy)
    if (typeof args.take === 'number') list = list.slice(0, args.take)
    return list.map(r => project(rel.model, r, args))
  }

  function project(model: string, row: Row, args: Row = {}): Row {
    const { select, include } = args
    if (select) {
      const out: Row = {}
      for (const [key, spec] of Object.entries(select as Row)) {
        if (!spec) continue
        if (key === '_count') {
          const counts: Row = {}
          for (const [rel, on] of Object.entries((spec as Row).select as Row)) {
            if (!on) continue
            const relModel = relationOf(model, rel)?.model as string
            const where = isPlainObject(on) ? (on.where as Row | undefined) : undefined
            counts[rel] = (related(model, rel, row) as Row[]).filter(r => matches(relModel, r, where)).length
          }
          out._count = counts
        } else if (relationOf(model, key)) {
          out[key] = projectRelation(model, key, row, spec)
        } else {
          out[key] = row[key] ?? null
        }
      }
      return out
    }
    const out: Row = { ...row }
    for (const [key, spec] of Object.entries((include ?? {}) as Row)) {
      if (spec) out[key] = projectRelation(model, key, row, spec)
    }
    return out
  }

  function applyData(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      if (isPlainObject(value) && ('increment' in value || 'decrement' in value || 'set' in value)) {
        if ('set' in value) row[key] = value.set
        if ('increment' in value) row[key] = (row[key] ?? 0) + value.increment
        if ('decrement' in value) row[key] = (row[key] ?? 0) - value.decrement
      } else {
        row[key] = value
      }
    }
    if (!('updatedAt' in data) && 'updatedAt' in row) row.updatedAt = new Date()
  }

  const notFound = () => Object.assign(new Error('Record to update not found.'), { code: 'P2025' })

  function readDelegate(model: ModelName) {
    return {
      findUnique: async (args: Row) => {
        const row = tables[model].find(r => matches(model, r, args.where))
        return row ? project(model, row, args) : null
      },
      findFirst: async (args: Row = {}) => {
        const rows = sortRows(tables[model].filter(r => matches(model, r, args.where)), args.orderBy)
        return rows[0] ? project(model, rows[0], args) : null
      },
      findMany: async (args: Row = {}) => {
        let rows = sortRows(tables[model].filter(r => matches(model, r, args.where)), args.orderBy)
        if (typeof args.take === 'number') rows = rows.slice(0, args.take)
        return rows.map(r => project(model, r, args))
      },
      count: async (args: Row = {}) => tables[model].filter(r => matches(model, r, args.where)).length,
    }
  }

  function writeDelegate(model: ModelName) {
    return {
      ...readDelegate(model),
      create: async (args: Row) => {
        const now = new Date()
        const row: Row = { id: `${model}-${nextId++}`, createdAt: now, updatedAt: now, ...args.data }
        if (model.endsWith('Withdrawal') && !row.date) row.date = now
        tables[model].push(row)
        return project(model, row, args)
      },
      update: async (args: Row) => {
        const row = tables[model].find(r => matches(model, r, args.where))
        if (!row) throw notFound()
        applyData(row, args.data)
        return project(model, row, args)
      },
      updateMany: async (args: Row) => {
        const rows = tables[model].filter(r => matches(model, r, args.where))
        rows.forEach(row => applyData(row, args.data))
        return { count: rows.length }
      },
      delete: async (args: Row) => {
        const row = tables[model].find(r => matches(model, r, args.where))
        if (!row) throw notFound()
        tables[model] = tables[model].filter(r => r !== row)
        return { ...row }
      },
      deleteMany: async (args: Row = {}) => {
        const before = tables[model].length
        const removed = tables[model].filter(r => matches(model, r, args.where))
        tables[model] = tables[model].filter(r => !removed.includes(r))
        // The schema cascades a lot's price history and withdrawals with it.
        const ids = new Set(removed.map(r => r.id))
        if (model === 'greenBeanLot') {
          tables.pricingHistory = tables.pricingHistory.filter(r => !ids.has(r.greenBeanLotId))
          tables.greenBeanWithdrawal = tables.greenBeanWithdrawal.filter(r => !ids.has(r.greenBeanLotId))
        }
        if (model === 'parchmentLot') {
          tables.parchmentWithdrawal = tables.parchmentWithdrawal.filter(r => !ids.has(r.parchmentLotId))
        }
        return { count: before - tables[model].length }
      },
    }
  }

  const tx: Row = Object.fromEntries(MODELS.map(model => [model, writeDelegate(model)]))
  tx.$queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    // A Prisma.join(...) value is a fragment of its own: one ? per item.
    const fragments = values.map(value => (isSqlFragment(value) ? value : null))
    const text = strings.reduce(
      (sql, part, i) =>
        i === 0 ? part : sql + (fragments[i - 1] ? fragments[i - 1]!.strings.join('?') : '?') + part,
      '',
    )
    const flat = values.flatMap((value, i) => (fragments[i] ? fragments[i]!.values : [value]))
    locks.push(text.replace(/\s+/g, ' ').trim() + ` [${flat.map(String).join(', ')}]`)
    return []
  }

  const client: Row = Object.fromEntries(MODELS.map(model => [model, readDelegate(model)]))
  client.$transaction = async (callback: (txClient: Row) => Promise<unknown>) => {
    const snapshot = structuredClone(tables)
    try {
      return await callback(tx)
    } catch (error) {
      tables = snapshot
      throw error
    }
  }

  return {
    client,
    tx,
    locks,
    /** The live rows of `model` (mutable: tests may seed or edit them). */
    rows: (model: ModelName) => tables[model],
    /** One row of `model` by id, or undefined. */
    get: (model: ModelName, id: string) => tables[model].find(r => r.id === id),
    /** Adds a row with createdAt / updatedAt filled in, and returns it. */
    seed: (model: ModelName, row: Row) => {
      const now = new Date()
      const full = { createdAt: now, updatedAt: now, ...row }
      tables[model].push(full)
      return full
    },
    reset: () => {
      tables = emptyTables()
      nextId = 1
      locks.length = 0
    },
  }
}

export type MemoryPrisma = ReturnType<typeof createMemoryPrisma>
