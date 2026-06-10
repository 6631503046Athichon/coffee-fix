import { NextRequest, NextResponse } from 'next/server'
import { Prisma, ParchmentLotStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { nextDisplayId, safeParseFloat, withDisplayIdRetry } from '@/lib/utils'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'

// GET /api/parchment-lots - List all parchment lots
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

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
        withdrawalHistory: { orderBy: { date: 'desc' as const } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ parchmentLots })
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
    if (!isExternal && (!processingBatchId || !harvestLotId)) {
      return NextResponse.json(
        { error: 'Processing batch ID and harvest lot ID are required for internal parchment lots' },
        { status: 400 }
      )
    }
    if (initialWeightKg === undefined || moistureContent === undefined || !processType) {
      return NextResponse.json(
        { error: 'Initial weight, moisture content, and process type are required' },
        { status: 400 }
      )
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
          processingBatchId: processingBatchId || null,
          harvestLotId: harvestLotId || null,
          sourceType: isExternal ? 'External' : 'Internal',
          externalSource: isExternal && externalSource ? externalSource : undefined,
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
