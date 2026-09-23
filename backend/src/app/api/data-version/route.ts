import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError, type AuthenticatedUser } from '@/lib/middleware'
import { canSeeSales, isAdminUser } from '@/lib/saleOrders'

export const dynamic = 'force-dynamic'

type VersionRow = { updatedAt: Date | null; version?: string } | null

// Latest updatedAt plus the row count, hashed into a short change marker: a
// deleted row changes the stamp even when the newest row stays the same. The
// hash is not a secret (anyone who knows the newest updatedAt can try counts
// until it matches), so every caller only gets stamps over rows they can
// already list: the count inside never tells them anything new.
const stamp = (updatedAt: Date | null | undefined, count: number) =>
  createHash('sha256').update(`${updatedAt?.toISOString() ?? 'none'}#${count}`).digest('hex').slice(0, 16)

// The roles that receive the (shared) customer list: GET /api/customers for
// Admins and Roasters, bulk-load for Processors too.
const canSeeCustomers = (user: AuthenticatedUser) => canSeeSales(user) || user.roles.includes('Processor')

const TABLE_QUERIES: { key: string; query: (user: AuthenticatedUser) => Promise<VersionRow> }[] = [
  { key: 'farms', query: () => prisma.farm.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'harvestLots', query: () => prisma.harvestLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'cropYears', query: () => prisma.cropYear.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'processTypes', query: () => prisma.processType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'activityTypes', query: () => prisma.activityType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'coffeeGrades', query: () => prisma.coffeeGrade.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  {
    key: 'customers',
    query: async (user) => {
      if (!canSeeCustomers(user)) return null
      const [latest, count] = await Promise.all([
        prisma.customer.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.customer.count(),
      ])
      return { updatedAt: latest?.updatedAt ?? null, version: stamp(latest?.updatedAt, count) }
    },
  },
  { key: 'users', query: () => prisma.user.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'soilAnalyses', query: () => prisma.soilAnalysis.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'weatherRecords', query: () => prisma.weatherRecord.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'gapLogs', query: () => prisma.gAPLogEntry.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'processingBatches', query: () => prisma.processingBatch.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'parchmentLots', query: () => prisma.parchmentLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'greenBeanLots', query: () => prisma.greenBeanLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'roasterInventory', query: () => prisma.roasterInventoryItem.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'roastBatches', query: () => prisma.roastBatch.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  // Sales and invoices are scoped like their list routes: an Admin gets the
  // stamp over every roaster's rows, a Roaster only over their own, and other
  // roles none. So one roaster's sales never reload (or reveal counts or
  // timing to) anyone else.
  {
    key: 'saleOrders',
    query: async (user) => {
      if (!canSeeSales(user)) return null
      const where = isAdminUser(user) ? {} : { createdBy: user.id }
      const [latest, count] = await Promise.all([
        prisma.saleOrder.findFirst({ where, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.saleOrder.count({ where }),
      ])
      return { updatedAt: latest?.updatedAt ?? null, version: stamp(latest?.updatedAt, count) }
    },
  },
  {
    key: 'invoices',
    query: async (user) => {
      if (!canSeeSales(user)) return null
      return prisma.invoice.findFirst({
        where: isAdminUser(user) ? {} : { saleOrder: { createdBy: user.id } },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      })
    },
  },
  {
    key: 'pricingHistory',
    query: async () => {
      const latestEntry = await prisma.pricingHistory.findFirst({
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      })

      return {
        updatedAt: latestEntry?.createdAt ?? null,
      }
    },
  },
]

/**
 * GET /api/data-version
 * Returns the latest updatedAt timestamp per table for smart auto-refresh
 * (customers and saleOrders return a short hash that also moves on deletes).
 * customers, saleOrders and invoices are null for roles that cannot read them,
 * and saleOrders/invoices cover only the caller's own sales unless Admin.
 * Uses Promise.allSettled for graceful degradation - partial results on partial failure.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const results = await Promise.allSettled(
      TABLE_QUERIES.map(t => t.query(user))
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
