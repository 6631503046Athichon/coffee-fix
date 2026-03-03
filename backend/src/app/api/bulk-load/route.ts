import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bulk-load?phase=1|2
 * Combines multiple resource queries into a single request to reduce HTTP round-trips.
 * Phase 1: Essential data (farms, harvestLots, cropYears, processTypes, activityTypes, customers, users)
 * Phase 2: Secondary data (soilAnalyses, weatherRecords, gapLogs, processingBatches, parchmentLots, greenBeanLots, roasterInventory, roastBatches)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const phase = searchParams.get('phase') || '1'

    // Pre-compute role checks
    const isAdmin = user.roles.includes('Admin') || user.isSuperAdmin
    const isFarmer = user.roles.includes('Farmer')
    const isRoaster = user.roles.includes('Roaster')

    if (phase === '1') {
      // Phase 1: Essential data
      const farmsWhere: Record<string, unknown> = {}
      if (!isAdmin) {
        farmsWhere.ownerId = user.id
      }

      const [farms, harvestLots, cropYears, processTypes, activityTypes, customers, users] = await Promise.all([
        // Farms
        prisma.farm.findMany({
          where: farmsWhere,
          include: {
            owner: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Harvest Lots
        prisma.harvestLot.findMany({
          where: isFarmer && !isAdmin ? { farm: { ownerId: user.id } } : {},
          include: {
            farm: { select: { id: true, farmName: true, location: true } },
            cropYear: { select: { id: true, year: true } },
          },
          orderBy: { harvestDate: 'desc' },
        }),

        // Crop Years
        prisma.cropYear.findMany({
          orderBy: { startDate: 'desc' },
          include: {
            _count: { select: { harvestLots: true, processingBatches: true } },
          },
        }),

        // Process Types
        prisma.processType.findMany({
          orderBy: { createdAt: 'desc' },
        }),

        // Activity Types
        prisma.activityType.findMany({
          orderBy: { createdAt: 'desc' },
        }),

        // Customers
        prisma.customer.findMany({
          include: {
            _count: { select: { saleOrders: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Users (different shapes for admin vs non-admin)
        isAdmin
          ? prisma.user.findMany({
              select: {
                id: true, username: true, email: true, name: true,
                roles: true, isActive: true, isSuperAdmin: true,
                createdAt: true, lastLogin: true, mustChangePassword: true,
              },
              orderBy: { createdAt: 'desc' },
            })
          : prisma.user.findMany({
              where: { isActive: true },
              select: { id: true, name: true, roles: true },
              orderBy: { name: 'asc' },
            }),
      ])

      // Parse colorScheme for process types (safe per-item parsing)
      const parsedProcessTypes = processTypes.map(pt => ({
        ...pt,
        colorScheme: typeof pt.colorScheme === 'string'
          ? (() => { try { return JSON.parse(pt.colorScheme as string) } catch { return {} } })()
          : pt.colorScheme,
      }))

      return NextResponse.json({
        farms,
        harvestLots,
        cropYears,
        processTypes: parsedProcessTypes,
        activityTypes,
        customers,
        users,
      })
    }

    if (phase === '2') {
      // Phase 2: Secondary data
      // Pre-fetch farm IDs once for farmer-scoped queries
      let farmIds: string[] = []
      if (isFarmer && !isAdmin) {
        const farms = await prisma.farm.findMany({
          where: { ownerId: user.id },
          select: { id: true },
        })
        farmIds = farms.map(f => f.id)
      }

      const farmScopeWhere = isFarmer && !isAdmin
        ? { farmId: { in: farmIds } }
        : {}
      const processingScopeWhere = isFarmer && !isAdmin
        ? { harvestLot: { farmId: { in: farmIds } } }
        : {}
      const parchmentScopeWhere = isFarmer && !isAdmin
        ? { harvestLot: { farmId: { in: farmIds } } }
        : {}
      const greenBeanScopeWhere = isFarmer && !isAdmin
        ? { parchmentLot: { harvestLot: { farmId: { in: farmIds } } } }
        : {}

      // Roaster scope
      const roasterWhere: Record<string, unknown> = {}
      if (isRoaster && !isAdmin) {
        roasterWhere.roasterId = user.id
      }

      const [soilAnalyses, weatherRecords, gapLogs, processingBatches, parchmentLots, greenBeanLots, roasterInventory, roastBatches] = await Promise.all([
        // Soil Analyses
        prisma.soilAnalysis.findMany({
          where: farmScopeWhere,
          take: 100,
          include: {
            farm: { select: { id: true, farmName: true, location: true } },
            createdByUser: { select: { id: true, name: true } },
          },
          orderBy: { testDate: 'desc' },
        }),

        // Weather Records
        prisma.weatherRecord.findMany({
          where: farmScopeWhere,
          take: 100,
          include: {
            farm: { select: { id: true, farmName: true, location: true } },
            recordedByUser: { select: { id: true, name: true } },
          },
          orderBy: { recordDate: 'desc' },
        }),

        // GAP Logs
        prisma.gAPLogEntry.findMany({
          where: farmScopeWhere,
          take: 100,
          include: {
            farm: { select: { id: true, farmName: true, location: true } },
            activityType: { select: { id: true, name: true, description: true } },
            createdByUser: { select: { id: true, name: true } },
          },
          orderBy: { date: 'desc' },
        }),

        // Processing Batches
        prisma.processingBatch.findMany({
          where: processingScopeWhere,
          take: 50,
          include: {
            harvestLot: {
              select: { id: true, farmerName: true, cherryVariety: true, weightKg: true },
            },
            cropYear: { select: { id: true, year: true } },
            dryingLogs: { orderBy: { date: 'desc' }, take: 10 },
            parchmentLots: {
              select: {
                id: true, status: true, initialWeightKg: true,
                currentWeightKg: true, moistureContent: true, processType: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Parchment Lots
        prisma.parchmentLot.findMany({
          where: parchmentScopeWhere,
          take: 100,
          include: {
            processingBatch: { select: { id: true, processType: true, status: true } },
            harvestLot: { select: { id: true, farmerName: true, cherryVariety: true } },
            physicalTestResults: true,
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Green Bean Lots
        prisma.greenBeanLot.findMany({
          where: greenBeanScopeWhere,
          include: {
            parchmentLot: {
              include: {
                processingBatch: { select: { id: true, processType: true } },
                harvestLot: { select: { id: true, farmerName: true, cherryVariety: true } },
              },
            },
            priceSetter: { select: { id: true, name: true } },
            withdrawalHistory: {
              include: {
                withdrawnByUser: {
                  select: { id: true, name: true },
                },
              },
              orderBy: { date: 'desc' },
            },
            _count: { select: { cuppingScores: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),

        // Roaster Inventory
        prisma.roasterInventoryItem.findMany({
          where: roasterWhere,
          take: 100,
          include: {
            roaster: { select: { id: true, name: true } },
            greenBeanLot: {
              include: {
                parchmentLot: {
                  include: {
                    harvestLot: { select: { id: true, farmerName: true, cherryVariety: true } },
                  },
                },
                priceSetter: { select: { id: true, name: true } },
                withdrawalHistory: {
                  orderBy: { createdAt: 'desc' as const },
                  take: 5,
                  select: { withdrawalType: true, amountKg: true, date: true, withdrawnByName: true },
                },
              },
            },
            roastBatches: { orderBy: { roastDate: 'desc' }, take: 5 },
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Roast Batches
        prisma.roastBatch.findMany({
          where: roasterWhere,
          take: 100,
          include: {
            roaster: { select: { id: true, name: true } },
            greenBeanLot: { select: { id: true, grade: true, sourceType: true } },
            roasterInventory: { select: { id: true, claimedWeightKg: true, remainingWeightKg: true } },
          },
          orderBy: { roastDate: 'desc' },
        }),
      ])

      return NextResponse.json({
        soilAnalyses,
        weatherRecords,
        gapLogs,
        processingBatches,
        parchmentLots,
        greenBeanLots,
        roasterInventory,
        roastBatches,
      })
    }

    return NextResponse.json({ error: 'Invalid phase parameter. Use phase=1 or phase=2' }, { status: 400 })
  } catch (error) {
    return handleApiError(error)
  }
}
