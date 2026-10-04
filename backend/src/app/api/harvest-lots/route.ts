import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, createHarvestLotSchema } from '@/lib/validations'
import { nextDisplayId, parseDateOnly, withDisplayIdRetry } from '@/lib/utils'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { harvestLotStatusFilter, serializeHarvestLot } from '@/lib/harvestLot'
import { chainScope } from '@/lib/farmAccess'
import { isAdminUser } from '@/lib/saleOrders'

// This route depends on auth cookies/headers, so it must be dynamic.
export const dynamic = 'force-dynamic'

// GET /api/harvest-lots - List all harvest lots
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Record<string, unknown> = {}

    // Filter by farmId if provided
    const farmId = request.nextUrl.searchParams.get('farmId')
    if (farmId) {
      where.farmId = farmId
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      if (status !== 'ReadyForProcessing' && status !== 'Complete') {
        return NextResponse.json({ error: 'Invalid harvest lot status' }, { status: 400 })
      }
      Object.assign(where, harvestLotStatusFilter(status))
    }

    // Each their own (lib/farmAccess chainScope): a farmer's own and shared
    // farms' lots, every processor's Ready cherry plus the lots their batches
    // used, a roaster's only as the source of their green beans; the union
    // for several roles. Admins see every lot.
    const scope = await chainScope(user)
    if (scope) {
      where.AND = [scope.harvestLotWhere]
    }

    // Pagination
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const [harvestLots, total] = await Promise.all([
      prisma.harvestLot.findMany({
        where,
        include: {
          _count: { select: { processingBatches: true } },
          farm: {
            select: {
              id: true,
              farmName: true,
              location: true,
            },
          },
          cropYear: {
            select: {
              id: true,
              year: true,
            },
          },
        },
        orderBy: { harvestDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.harvestLot.count({ where }),
    ])

    return NextResponse.json({ harvestLots: harvestLots.map(serializeHarvestLot), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/harvest-lots - Create new harvest lot
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Admin'])
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited

    // Validate request body with Zod
    const validation = await validateBody(request, createHarvestLotSchema)
    if (!validation.success) {
      return validation.error
    }

    const { farmerName, cherryVariety, weightKg, farmPlotLocation, harvestDate, status, cropYearId, farmId } = validation.data

    // The lot belongs to its farm's owner, so a lot an Admin records for a
    // farmer is the farmer's to edit and delete. Without a farm it belongs to
    // whoever records it.
    let ownerId = user.id

    // SECURITY: If farmId is provided, verify ownership before creating the lot.
    if (farmId) {
      const farm = await prisma.farm.findUnique({
        where: { id: farmId },
        select: { ownerId: true },
      })

      if (!farm) {
        return NextResponse.json(
          { error: 'Farm not found' },
          { status: 404 }
        )
      }

      // Only the farm's owner (or an Admin) records its cherry; a collaborator
      // reads the farm's lots but is told who may add them.
      if (!isAdminUser(user) && farm.ownerId !== user.id) {
        return NextResponse.json(
          { error: 'Only the farm owner can register harvest lots on this farm' },
          { status: 403 }
        )
      }
      ownerId = farm.ownerId
    }

    // Validate cropYearId if provided
    let validCropYearId = cropYearId || null
    if (cropYearId) {
      const cropYear = await prisma.cropYear.findUnique({
        where: { id: cropYearId },
      })

      if (!cropYear) {
        return NextResponse.json(
          {
            error: 'Validation Error',
            message: 'ข้อมูลไม่ถูกต้อง',
            details: [{ field: 'cropYearId', message: 'ไม่พบปีการผลิตที่ระบุ' }]
          },
          { status: 400 }
        )
      }
    }

    const harvestLot = await withDisplayIdRetry(async () => {
      const displayId = await nextDisplayId(prisma.harvestLot, 'HL')
      return prisma.harvestLot.create({
        data: {
          displayId,
          farmerName,
          cherryVariety,
          weightKg,
          farmPlotLocation,
          harvestDate: parseDateOnly(harvestDate) ?? new Date(),
          status: status || 'ReadyForProcessing',
          cropYearId: validCropYearId,
          farmId: farmId || null,
          createdById: ownerId,
        },
        include: {
          farm: {
            select: {
              id: true,
              farmName: true,
              location: true,
            },
          },
          cropYear: {
            select: {
              id: true,
              year: true,
            },
          },
        },
      })
    })

    return NextResponse.json(
      { harvestLot, message: 'Harvest lot created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

