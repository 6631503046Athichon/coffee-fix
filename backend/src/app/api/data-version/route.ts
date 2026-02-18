import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

/**
 * GET /api/data-version
 * Returns the latest updatedAt timestamp per table for smart auto-refresh.
 * Frontend compares these with cached versions to decide which data to reload.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const [
      farm, harvestLot, cropYear, processType, activityType, customer, user,
      soilAnalysis, weatherRecord, gapLog, processingBatch, parchmentLot,
      greenBeanLot, roasterInventory, roastBatch,
    ] = await Promise.all([
      prisma.farm.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.harvestLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.cropYear.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.processType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.activityType.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.customer.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.user.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.soilAnalysis.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.weatherRecord.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.gAPLogEntry.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.processingBatch.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.parchmentLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.greenBeanLot.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.roasterInventoryItem.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.roastBatch.findFirst({ select: { updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
    ])

    return NextResponse.json({
      farms: farm?.updatedAt?.toISOString() ?? null,
      harvestLots: harvestLot?.updatedAt?.toISOString() ?? null,
      cropYears: cropYear?.updatedAt?.toISOString() ?? null,
      processTypes: processType?.updatedAt?.toISOString() ?? null,
      activityTypes: activityType?.updatedAt?.toISOString() ?? null,
      customers: customer?.updatedAt?.toISOString() ?? null,
      users: user?.updatedAt?.toISOString() ?? null,
      soilAnalyses: soilAnalysis?.updatedAt?.toISOString() ?? null,
      weatherRecords: weatherRecord?.updatedAt?.toISOString() ?? null,
      gapLogs: gapLog?.updatedAt?.toISOString() ?? null,
      processingBatches: processingBatch?.updatedAt?.toISOString() ?? null,
      parchmentLots: parchmentLot?.updatedAt?.toISOString() ?? null,
      greenBeanLots: greenBeanLot?.updatedAt?.toISOString() ?? null,
      roasterInventory: roasterInventory?.updatedAt?.toISOString() ?? null,
      roastBatches: roastBatch?.updatedAt?.toISOString() ?? null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
