import { NextRequest, NextResponse } from 'next/server'
import { Prisma, ParchmentLotStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { nextDisplayId, safeParseFloat, withDisplayIdRetry } from '@/lib/utils'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { parchmentLotForViewer } from '@/lib/withdrawalPrivacy'
import { withoutImporterFor } from '@/lib/importerPrivacy'
import { chainScope } from '@/lib/farmAccess'

// The body's externalSource as an object to add to, or an empty one.
function externalSourceObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Prisma.InputJsonObject) }
    : {}
}

// GET /api/parchment-lots - List all parchment lots
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.ParchmentLotWhereInput = {}

    // Filter by processingBatchId if provided
    const processingBatchId = request.nextUrl.searchParams.get('processingBatchId')
    if (processingBatchId) {
      where.processingBatchId = processingBatchId
    }

    // Filter by status if provided (validated against enum)
    const status = request.nextUrl.searchParams.get('status')
    if (status && (Object.values(ParchmentLotStatus) as string[]).includes(status)) {
      where.status = status as ParchmentLotStatus
    }

    // processType is a String field in schema, accepts any value
    const processType = request.nextUrl.searchParams.get('processType')
    if (processType) {
      where.processType = processType
    }

    // Each their own (lib/farmAccess chainScope): a processor's batches'
    // parchment and what they imported, a farmer's from their own and shared
    // farms' cherry, a roaster's only as the source of their green beans; the
    // union for several roles. Admins see every lot.
    const scope = await chainScope(user)
    if (scope) {
      where.AND = [scope.parchmentLotWhere]
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 200)

    const parchmentLots = await prisma.parchmentLot.findMany({
      where,
      take: limit,
      include: {
        processingBatch: {
          select: {
            id: true,
            processType: true,
            status: true,
            // The lot's owner, for the withdrawal privacy check below, and
            // the farm canReadBatch looks at.
            createdById: true,
            harvestLot: { select: { farmId: true } },
          },
        },
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
          },
        },
        physicalTestResults: true,
        // A roaster reading the parchment behind their green beans gets only
        // the rows into their own stock (lib/farmAccess chainScope).
        withdrawalHistory: {
          where: scope ? scope.parchmentWithdrawalWhere : {},
          orderBy: { date: 'desc' as const },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Withdrawal sale details and purpose only for the lot's owner and
    // Admin; see lib/withdrawalPrivacy. The importer's user id only for
    // Admin and the importer; see lib/importerPrivacy. Then, as on the by-id
    // read, a reader who may not read the batch (a roaster labelling the
    // source of their green beans) gets only its id and process, not its
    // owner and status. The batch's harvestLot.farmId was loaded only for
    // that check and goes to no one.
    return NextResponse.json({
      parchmentLots: parchmentLots.map(lot => {
        const shaped = withoutImporterFor(user, parchmentLotForViewer(user, lot))
        const batch = lot.processingBatch
        if (!batch) return shaped
        if (scope && !scope.canReadBatch(batch)) {
          return { ...shaped, processingBatch: { id: batch.id, processType: batch.processType } }
        }
        const { harvestLot: _farmCheck, ...readableBatch } = batch
        return { ...shaped, processingBatch: readableBatch }
      }),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/parchment-lots - Create new parchment lot
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can create parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited

    const body = await request.json()
    const { processingBatchId, harvestLotId, initialWeightKg, currentWeightKg, moistureContent, processType, status, sourceType, externalSource } = body

    const isExternal = sourceType === 'External'

    // Validation
    // External parchment is bought in: no batch or harvest lot stands behind it.
    if (isExternal && (processingBatchId || harvestLotId)) {
      return NextResponse.json(
        { error: 'External parchment lots cannot name a processing batch or harvest lot' },
        { status: 400 }
      )
    }
    if (!isExternal && (!processingBatchId || typeof processingBatchId !== 'string')) {
      return NextResponse.json(
        { error: 'Processing batch ID is required for internal parchment lots' },
        { status: 400 }
      )
    }
    if (initialWeightKg === undefined || moistureContent === undefined || !processType) {
      return NextResponse.json(
        { error: 'Initial weight, moisture content, and process type are required' },
        { status: 400 }
      )
    }

    // SECURITY: internal parchment belongs to its processing batch's owner
    // (parchmentLot -> processingBatch.createdById), so only that processor or
    // an Admin may add it, and the harvest lot comes from the batch, never
    // from the body.
    let batchHarvestLotId: string | null = null
    if (!isExternal) {
      const batch = await prisma.processingBatch.findUnique({
        where: { id: processingBatchId },
        select: { createdById: true, harvestLotId: true },
      })
      if (!batch) {
        return NextResponse.json(
          { error: 'Processing batch not found' },
          { status: 404 }
        )
      }
      requireOwnership(user, batch.createdById, ['Admin'])
      if (harvestLotId && harvestLotId !== batch.harvestLotId) {
        return NextResponse.json(
          { error: 'Harvest lot does not match the processing batch' },
          { status: 400 }
        )
      }
      batchHarvestLotId = batch.harvestLotId
    }

    const parsedInitialWeight = safeParseFloat(initialWeightKg)
    const parsedCurrentWeight =
      currentWeightKg === undefined ? parsedInitialWeight : safeParseFloat(currentWeightKg)
    const parsedMoistureContent = safeParseFloat(moistureContent)

    if (parsedInitialWeight === null || parsedInitialWeight <= 0) {
      return NextResponse.json(
        { error: 'Initial weight must be greater than 0' },
        { status: 400 }
      )
    }

    if (parsedCurrentWeight === null || parsedCurrentWeight < 0) {
      return NextResponse.json(
        { error: 'Current weight must be 0 or greater' },
        { status: 400 }
      )
    }

    if (parsedCurrentWeight - parsedInitialWeight > 0.01) {
      return NextResponse.json(
        { error: 'Current weight cannot exceed initial weight' },
        { status: 400 }
      )
    }

    if (parsedMoistureContent === null || parsedMoistureContent < 0 || parsedMoistureContent > 100) {
      return NextResponse.json(
        { error: 'Moisture content must be between 0 and 100' },
        { status: 400 }
      )
    }

    const parchmentLot = await withDisplayIdRetry(async () => {
      const displayId = await nextDisplayId(prisma.parchmentLot, 'PCH')
      return prisma.parchmentLot.create({
        data: {
          displayId,
          processingBatchId: isExternal ? null : processingBatchId,
          harvestLotId: batchHarvestLotId,
          sourceType: isExternal ? 'External' : 'Internal',
          // Who brought it in, as the Excel import records it: bought-in
          // parchment has no batch, so this is who may read it besides Admins
          // (lib/farmAccess chainScope). Set here, never taken from the body.
          externalSource: isExternal ? { ...externalSourceObject(externalSource), importedBy: user.id } : undefined,
          initialWeightKg: parsedInitialWeight,
          currentWeightKg: parsedCurrentWeight,
          moistureContent: parsedMoistureContent,
          processType,
          status: status || (parsedCurrentWeight <= 0 ? 'Hulled' : 'AwaitingHulling'),
        },
        include: {
          processingBatch: {
            select: {
              id: true,
              processType: true,
              status: true,
            },
          },
          harvestLot: {
            select: {
              id: true,
              farmerName: true,
              cherryVariety: true,
            },
          },
        },
      })
    })

    return NextResponse.json(
      { parchmentLot, message: 'Parchment lot created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

// NOTE: PUT was removed from this file. The collection-level route does not
// own a path parameter, so the previous handler was effectively unreachable
// (and would have skipped ownership checks). Updates flow through PATCH on
// [id]/route.ts instead.
