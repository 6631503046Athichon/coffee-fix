import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, createHarvestLotSchema } from '@/lib/validations'
import { nextDisplayId, parseDateOnly, withDisplayIdRetry } from '@/lib/utils'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'

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
      where.status = status
    }

    // Farmers can only see their own farms' harvest lots
    if (user.roles.includes('Farmer') && !user.roles.includes('Admin')) {
      where.farm = { ownerId: user.id }
    }

    // Pagination
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const [harvestLots, total] = await Promise.all([
      prisma.harvestLot.findMany({
        where,
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
        orderBy: { harvestDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.harvestLot.count({ where }),
    ])

    return NextResponse.json({ harvestLots, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
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

      requireOwnership(user, farm.ownerId, ['Admin'])
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

