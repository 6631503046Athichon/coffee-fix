import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError, type AuthenticatedUser } from '@/lib/middleware'
import { canSeeSales, isAdminUser } from '@/lib/saleOrders'
import { chainScope, memberFarmIds, type ChainScope } from '@/lib/farmAccess'

export const dynamic = 'force-dynamic'

type VersionRow = { updatedAt: Date | null; version?: string } | null

// Latest updatedAt plus the row count, hashed into a short change marker: a
// deleted row changes the stamp even when the newest row stays the same, and
// so does a row leaving the caller's scope (a Ready cherry lot another
// processor just took). The hash is not a secret (anyone who knows the newest
// updatedAt can try counts until it matches), so every caller only gets
// stamps over rows they can already list: the count inside never tells them
// anything new, and another user's work elsewhere never moves their stamp.
const stamp = (updatedAt: Date | null | undefined, count: number) =>
  createHash('sha256').update(`${updatedAt?.toISOString() ?? 'none'}#${count}`).digest('hex').slice(0, 16)

/** The stamp over one scoped list: its newest change and its row count. */
async function versionOver(
  latest: Promise<{ updatedAt: Date } | null>,
  count: Promise<number>
): Promise<VersionRow> {
  const [row, rows] = await Promise.all([latest, count])
  return { updatedAt: row?.updatedAt ?? null, version: stamp(row?.updatedAt, rows) }
}

/** Runs `load` the first time it is asked for, then hands out the same promise. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | null = null
  return () => {
    if (!loaded) loaded = load()
    return loaded
  }
}

/** The caller, and what they may list, worked out once per request. */
interface Viewer {
  user: AuthenticatedUser
  isAdmin: boolean
  /** The lot chain they read (lib/farmAccess); null reads every lot. */
  chain: () => Promise<ChainScope | null>
  /** Farms they own or collaborate on (not used for Admins). */
  farmIds: () => Promise<string[]>
}

// The roles that receive the (shared) customer list: GET /api/customers for
// Admins and Roasters, bulk-load for Processors too.
const canSeeCustomers = (user: AuthenticatedUser) => canSeeSales(user) || user.roles.includes('Processor')

// Each list's stamp covers what bulk-load hands this caller:
// - farms: the ones they own or collaborate on; soil, weather and GAP those
//   farms' rows (every non-Admin, staff roles included)
// - the lot chain and its price history: lib/farmAccess chainScope, "each
//   their own" (Admins and cupping roles: every row)
// - roaster stock and roasts: a Roaster's own, every row for Admins, nothing
//   for other roles
// - users: Admins list every account with its last login; everyone else the
//   active users' names and roles, so their stamp hashes just that, and
//   another user logging in (which moves updatedAt) neither reloads them nor
//   tells them when it happened
// - crop years, process types, activity types and grades: shared reference
//   data, the same for everyone
const TABLE_QUERIES: { key: string; query: (viewer: Viewer) => Promise<VersionRow> }[] = [
  {
    key: 'farms',
    query: async ({ user, isAdmin }) => {
      const where = isAdmin
        ? {}
        : { OR: [{ ownerId: user.id }, { collaborators: { some: { userId: user.id } } }] }
      return versionOver(
        prisma.farm.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.farm.count({ where })
      )
    },
  },
  {
    key: 'harvestLots',
    query: async ({ chain }) => {
      const where = (await chain())?.harvestLotWhere ?? {}
      return versionOver(
        prisma.harvestLot.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.harvestLot.count({ where })
      )
    },
  },
  { key: 'cropYears', query: () => prisma.cropYear.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'processTypes', query: () => prisma.processType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'activityTypes', query: () => prisma.activityType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'coffeeGrades', query: () => prisma.coffeeGrade.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  {
    key: 'customers',
    query: async ({ user }) => {
      if (!canSeeCustomers(user)) return null
      const [latest, count] = await Promise.all([
        prisma.customer.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.customer.count(),
      ])
      return { updatedAt: latest?.updatedAt ?? null, version: stamp(latest?.updatedAt, count) }
    },
  },
  {
    key: 'users',
    query: async ({ isAdmin }) => {
      if (isAdmin) {
        return prisma.user.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } })
      }
      // The same rows and columns bulk-load phase 1 lists for a non-Admin.
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, roles: true },
        orderBy: { id: 'asc' },
      })
      const version = createHash('sha256').update(JSON.stringify(users)).digest('hex').slice(0, 16)
      return { updatedAt: null, version }
    },
  },
  {
    key: 'soilAnalyses',
    query: async ({ isAdmin, farmIds }) => {
      const where = isAdmin ? {} : { farmId: { in: await farmIds() } }
      return versionOver(
        prisma.soilAnalysis.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.soilAnalysis.count({ where })
      )
    },
  },
  {
    key: 'weatherRecords',
    query: async ({ isAdmin, farmIds }) => {
      const where = isAdmin ? {} : { farmId: { in: await farmIds() } }
      return versionOver(
        prisma.weatherRecord.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.weatherRecord.count({ where })
      )
    },
  },
  {
    key: 'gapLogs',
    query: async ({ isAdmin, farmIds }) => {
      const where = isAdmin ? {} : { farmId: { in: await farmIds() } }
      return versionOver(
        prisma.gAPLogEntry.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.gAPLogEntry.count({ where })
      )
    },
  },
  {
    key: 'processingBatches',
    query: async ({ chain }) => {
      const where = (await chain())?.processingBatchWhere ?? {}
      return versionOver(
        prisma.processingBatch.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.processingBatch.count({ where })
      )
    },
  },
  {
    key: 'parchmentLots',
    query: async ({ chain }) => {
      const where = (await chain())?.parchmentLotWhere ?? {}
      return versionOver(
        prisma.parchmentLot.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.parchmentLot.count({ where })
      )
    },
  },
  {
    key: 'greenBeanLots',
    query: async ({ chain }) => {
      const where = (await chain())?.greenBeanLotWhere ?? {}
      return versionOver(
        prisma.greenBeanLot.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.greenBeanLot.count({ where })
      )
    },
  },
  {
    key: 'roasterInventory',
    query: async ({ user, isAdmin }) => {
      if (!canSeeSales(user)) return null
      const where = isAdmin ? {} : { roasterId: user.id }
      return versionOver(
        prisma.roasterInventoryItem.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.roasterInventoryItem.count({ where })
      )
    },
  },
  {
    key: 'roastBatches',
    query: async ({ user, isAdmin }) => {
      if (!canSeeSales(user)) return null
      const where = isAdmin ? {} : { roasterId: user.id }
      return versionOver(
        prisma.roastBatch.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.roastBatch.count({ where })
      )
    },
  },
  // Sales and invoices are scoped like their list routes: an Admin gets the
  // stamp over every roaster's rows, a Roaster only over their own, and other
  // roles none. So one roaster's sales never reload (or reveal counts or
  // timing to) anyone else.
  {
    key: 'saleOrders',
    query: async ({ user, isAdmin }) => {
      if (!canSeeSales(user)) return null
      const where = isAdmin ? {} : { createdBy: user.id }
      const [latest, count] = await Promise.all([
        prisma.saleOrder.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.saleOrder.count({ where }),
      ])
      return { updatedAt: latest?.updatedAt ?? null, version: stamp(latest?.updatedAt, count) }
    },
  },
  {
    key: 'invoices',
    query: async ({ user, isAdmin }) => {
      if (!canSeeSales(user)) return null
      return prisma.invoice.findFirst({
        where: isAdmin ? {} : { saleOrder: { createdBy: user.id } },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      })
    },
  },
  {
    // Price history has no updatedAt: entries are only ever added.
    key: 'pricingHistory',
    query: async ({ chain }) => {
      const where = (await chain())?.pricingWhere ?? {}
      const [latest, count] = await Promise.all([
        prisma.pricingHistory.findFirst({ where, select: { createdAt: true }, orderBy: { createdAt: 'desc' } }),
        prisma.pricingHistory.count({ where }),
      ])
      return { updatedAt: latest?.createdAt ?? null, version: stamp(latest?.createdAt, count) }
    },
  },
]

/**
 * GET /api/data-version
 * Returns a change marker per table for smart auto-refresh: the latest
 * updatedAt, or a short hash that also moves on deletes. Each marker covers
 * only the rows the caller can list (see TABLE_QUERIES), so it neither
 * reloads them for other users' work nor tells them when it happened.
 * customers, saleOrders, invoices, roasterInventory and roastBatches are null
 * for roles that cannot read them.
 * Uses Promise.allSettled for graceful degradation - partial results on partial failure.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const isAdmin = isAdminUser(user)
    const viewer: Viewer = {
      user,
      isAdmin,
      chain: once(() => chainScope(user)),
      farmIds: once(() => (isAdmin ? Promise.resolve([]) : memberFarmIds(user))),
    }

    const results = await Promise.allSettled(
      TABLE_QUERIES.map(t => t.query(viewer))
    )

    const versions: Record<string, string | null> = {}
    let failedCount = 0

    TABLE_QUERIES.forEach((table, index) => {
      const result = results[index]
      if (result.status === 'fulfilled') {
        versions[table.key] = result.value?.version ?? result.value?.updatedAt?.toISOString() ?? null
      } else {
        versions[table.key] = null
        failedCount++
      }
    })

    // If ALL queries failed, the DB is truly down
    if (failedCount === TABLE_QUERIES.length) {
      return NextResponse.json(
        { error: 'Database unreachable', partial: versions },
        { status: 503 }
      )
    }

    return NextResponse.json(versions)
  } catch (error) {
    return handleApiError(error)
  }
}
