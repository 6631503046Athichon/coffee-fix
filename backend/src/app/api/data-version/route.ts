import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

const TABLE_QUERIES = [
  { key: 'farms', query: () => prisma.farm.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'harvestLots', query: () => prisma.harvestLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'cropYears', query: () => prisma.cropYear.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'processTypes', query: () => prisma.processType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'activityTypes', query: () => prisma.activityType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'customers', query: () => prisma.customer.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'users', query: () => prisma.user.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'soilAnalyses', query: () => prisma.soilAnalysis.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'weatherRecords', query: () => prisma.weatherRecord.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'gapLogs', query: () => prisma.gAPLogEntry.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'processingBatches', query: () => prisma.processingBatch.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'parchmentLots', query: () => prisma.parchmentLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'greenBeanLots', query: () => prisma.greenBeanLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'roasterInventory', query: () => prisma.roasterInventoryItem.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
  { key: 'roastBatches', query: () => prisma.roastBatch.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }) },
]

/**
 * GET /api/data-version
 * Returns the latest updatedAt timestamp per table for smart auto-refresh.
 * Uses Promise.allSettled for graceful degradation - partial results on partial failure.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const results = await Promise.allSettled(
      TABLE_QUERIES.map(t => t.query())
    )

    const versions: Record<string, string | null> = {}
    let failedCount = 0

    TABLE_QUERIES.forEach((table, index) => {
      const result = results[index]
      if (result.status === 'fulfilled') {
        versions[table.key] = result.value?.updatedAt?.toISOString() ?? null
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
