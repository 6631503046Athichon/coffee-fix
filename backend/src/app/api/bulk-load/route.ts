import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { serializeHarvestLot } from '@/lib/harvestLot'
import { greenBeanLotForViewer } from '@/lib/withdrawalPrivacy'
import { chainScope, memberFarmIds } from '@/lib/farmAccess'
import { upkeepCropYears } from '@/lib/cropYears'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bulk-load?phase=1|2
 * Combines multiple resource queries into a single request to reduce HTTP round-trips.
 * Phase 1: Essential data (farms, harvestLots, cropYears, processTypes, activityTypes, coffeeGrades, customers, users)
 * Phase 2: Secondary data (soilAnalyses, weatherRecords, gapLogs, processingBatches, parchmentLots, greenBeanLots, roasterInventory, roastBatches)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Each phase fans out to 7+ Prisma queries with deep includes. Cap at
    // 10/min per user — clients refresh the dashboard occasionally, not
    // every second.
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.EXPENSIVE,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited

    const { searchParams } = new URL(request.url)
    const phase = searchParams.get('phase') || '1'

    // Pre-compute role checks
    const isAdmin = user.roles.includes('Admin') || user.isSuperAdmin
    const isRoaster = user.roles.includes('Roaster')
    const isProcessor = user.roles.includes('Processor')

    if (phase === '1') {
      // Phase 1: Essential data
      const farmsWhere: Record<string, unknown> = {}
      if (!isAdmin) {
        farmsWhere.OR = [
          { ownerId: user.id },
          { collaborators: { some: { userId: user.id } } },
        ]
      }

      // Harvest lots follow "each their own" like GET /api/harvest-lots
      // (lib/farmAccess chainScope): a farmer's own and shared farms' lots,
      // every processor's Ready cherry plus the lots their batches used, a
      // roaster's only as the source of their green beans, the union for
      // several roles. Null (no limit) for Admins and cupping roles.
      const scope = await chainScope(user)

      // Lot and batch counts per crop year span every farmer and processor,
      // so only Admins get them; nothing on the client reads them.
      const listCropYears = () =>
        prisma.cropYear.findMany({
          orderBy: { startDate: 'desc' },
          ...(isAdmin
            ? { include: { _count: { select: { harvestLots: true, processingBatches: true } } } }
            : {}),
        })

      const [farms, harvestLots, loadedCropYears, processTypes, activityTypes, coffeeGrades, customers, users] = await Promise.all([
        // Farms
        prisma.farm.findMany({
          where: farmsWhere,
          include: {
            owner: { select: { id: true, name: true, email: true } },
            collaborators: {
              include: {
                user: { select: { id: true, name: true, email: true, roles: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Harvest Lots
        prisma.harvestLot.findMany({
          where: scope ? scope.harvestLotWhere : {},
          include: {
            _count: { select: { processingBatches: true } },
            farm: { select: { id: true, farmName: true, location: true } },
            cropYear: { select: { id: true, year: true } },
          },
          orderBy: { harvestDate: 'desc' },
        }),

        // Crop Years
        listCropYears(),

        // Process Types
        prisma.processType.findMany({
          orderBy: { createdAt: 'desc' },
        }),

        // Activity Types
        prisma.activityType.findMany({
          orderBy: { createdAt: 'desc' },
        }),

        // Coffee Grades (sortOrder keeps the grade dropdowns in the order
        // processors expect, not alphabetical order).
        //
        // Degrades to an empty list instead of rejecting: deploys run
        // `prisma generate`, not `db push`, so this code can reach
        // production a few minutes before the table does. Phase 1 is the
        // app's essential data — one missing reference table must not take
        // the whole dashboard down. The frontend falls back to its built-in
        // grade list when this comes back empty.
        prisma.coffeeGrade
          .findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
          .catch(error => {
            console.warn('bulk-load: coffee grades unavailable:', error?.message)
            return []
          }),

        // Customers: the shared address book. Roasters sell to them and
        // processors pick them in the green-bean Sale withdrawal; other roles
        // have no use for the contact details. No sale counts here: a count
        // across every roaster's sales would leak their activity.
        isAdmin || isRoaster || isProcessor
          ? prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })
          : Promise.resolve([]),

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

      // Crop years roll over on 1 October (Thai date), and nothing else adds
      // the new one: without it no crop year contains today and new lots
      // save with no crop year. So phase 1, which every logged-in session
      // loads, adds whichever of previous / current / next is missing,
      // replaces the stale "Previous / Current / Next crop year" labels the
      // old route left, and lists them again. Usually there is nothing to do
      // and this costs no query. A failure keeps the list already loaded
      // instead of failing phase 1.
      let cropYears = loadedCropYears
      try {
        if (await upkeepCropYears(loadedCropYears)) {
          cropYears = await listCropYears()
        }
      } catch (error) {
        console.warn('bulk-load: could not update the crop years:', (error as Error)?.message)
      }

      // Parse colorScheme for process types (safe per-item parsing)
      const parsedProcessTypes = processTypes.map(pt => ({
        ...pt,
        colorScheme: typeof pt.colorScheme === 'string'
          ? (() => { try { return JSON.parse(pt.colorScheme as string) } catch { return {} } })()
          : pt.colorScheme,
      }))

      return NextResponse.json({
        farms,
        harvestLots: harvestLots.map(serializeHarvestLot),
        cropYears,
        processTypes: parsedProcessTypes,
        activityTypes,
        coffeeGrades,
        customers,
        users,
      })
    }

    if (phase === '2') {
      // Phase 2: Secondary data
      // Farms the user owns or collaborates on, and the lot chain they may
      // read (null: Admins and cupping roles, who read every lot).
      const [farmIds, scope] = await Promise.all([
        isAdmin ? Promise.resolve([] as string[]) : memberFarmIds(user),
        chainScope(user),
      ])

      // Soil, weather and GAP records: every non-Admin sees only their own and
      // shared farms' (lib/farmAccess, as the list and by-id routes do), staff
      // roles included; nothing outside the farmer pages reads them.
      const farmScopeWhere = isAdmin
        ? {}
        : { farmId: { in: farmIds } }
      // The lot chain follows "each their own", as the list routes do: a
      // farmer's farms' chain, a processor's own batches and what they made
      // from them, a roaster's green beans (their own, held, roasted and the
      // shelf) with the parchment behind them and no batches; the union for
      // several roles.
      const processingScopeWhere = scope ? scope.processingBatchWhere : {}
      const parchmentScopeWhere = scope ? scope.parchmentLotWhere : {}
      const greenBeanScopeWhere = scope ? scope.greenBeanLotWhere : {}

      // Roaster scope: roasters get their own inventory and roasts, Admins
      // get everyone's, and other roles get none (the rows carry sold kg).
      const canSeeRoasts = isAdmin || isRoaster
      const roasterWhere: Record<string, unknown> = {}
      if (isRoaster && !isAdmin) {
        roasterWhere.roasterId = user.id
      }
      // The withdrawals named on a roaster's stock rows: only the ones that
      // put kg into this roaster's stock, never another buyer's kg and dates.
      // Admins read every row, so every withdrawal that is not void.
      const stockWithdrawalWhere = isAdmin
        ? { voidedAt: null }
        : { voidedAt: null, targetRoasterId: user.id }

      // No row caps on soil, GAP, batches or parchment: the pages build their
      // tables, reports and CSVs from these lists, so a cap hid older rows.
      // Parchment past it could not be Hull & Graded, green beans from it
      // grouped as "Unknown", batch ids were made up from row ids, and the
      // GAP report silently left entries out. The scoping above bounds them.
      // To keep the whole lists light, batches, parchment and green beans nest
      // only what the client keeps: the frontend's transform*FromBackend
      // dropped their other nested rows unread.
      const [soilAnalyses, weatherRecords, gapLogs, processingBatches, parchmentLots, greenBeanLots, roasterInventory, roastBatches] = await Promise.all([
        // Soil Analyses
        prisma.soilAnalysis.findMany({
          where: farmScopeWhere,
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
          include: {
            // Every reading, oldest first: the processor's Drying log popup
            // edits them all and Quality Insights plots the whole curve.
            dryingLogs: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Parchment Lots
        prisma.parchmentLot.findMany({
          where: parchmentScopeWhere,
          include: {
            physicalTestResults: true,
          },
          orderBy: { createdAt: 'desc' },
        }),

        // Green Bean Lots
        // No `take` cap: the scope above bounds every non-Admin's list, and
        // Admins are expected to see the full list on the dashboard. A
        // misleading `take: 50` here previously silently truncated farmer
        // dashboards once they had >50 lots across all their farms.
        prisma.greenBeanLot.findMany({
          where: greenBeanScopeWhere,
          include: {
            // Only the process type: the Parchment page groups the lot by it
            // even when its parchment lot is not in the parchment list.
            parchmentLot: {
              select: {
                processType: true,
                processingBatch: { select: { processType: true } },
              },
            },
            priceSetter: { select: { id: true, name: true } },
            // A roaster gets only the rows into their own stock on a lot
            // they hold or see on the shelf (lib/farmAccess chainScope).
            withdrawalHistory: {
              where: scope ? scope.greenWithdrawalWhere : {},
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
        }),

        // Roaster Inventory
        canSeeRoasts ? prisma.roasterInventoryItem.findMany({
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
                // The latest withdrawal names how the roaster got the lot; a
                // voided one (D7) never happened, so it is left out.
                withdrawalHistory: {
                  where: stockWithdrawalWhere,
                  orderBy: { createdAt: 'desc' as const },
                  take: 5,
                  select: { withdrawalType: true, amountKg: true, date: true, withdrawnByName: true },
                },
              },
            },
            roastBatches: { orderBy: { roastDate: 'desc' }, take: 5 },
          },
          orderBy: { createdAt: 'desc' },
        }) : Promise.resolve([]),

        // Roast Batches
        canSeeRoasts ? prisma.roastBatch.findMany({
          where: roasterWhere,
          take: 100,
          include: {
            roaster: { select: { id: true, name: true } },
            greenBeanLot: { select: { id: true, grade: true, sourceType: true } },
            roasterInventory: { select: { id: true, claimedWeightKg: true, remainingWeightKg: true } },
          },
          orderBy: { roastDate: 'desc' },
        }) : Promise.resolve([]),
      ])

      return NextResponse.json({
        soilAnalyses,
        weatherRecords,
        gapLogs,
        processingBatches,
        parchmentLots,
        // Withdrawal sale details (customer, address, price, invoice) and
        // the free-text purpose only for the lot's owner and Admin; see
        // lib/withdrawalPrivacy.
        greenBeanLots: greenBeanLots.map(lot => greenBeanLotForViewer(user, lot)),
        roasterInventory,
        roastBatches,
      })
    }

    return NextResponse.json({ error: 'Invalid phase parameter. Use phase=1 or phase=2' }, { status: 400 })
  } catch (error) {
    return handleApiError(error)
  }
}
