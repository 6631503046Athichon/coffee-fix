import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, createHarvestLotSchema } from '@/lib/validations'

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
      const farms = await prisma.farm.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      })
      where.farmId = { in: farms.map(f => f.id) }
    }

    const harvestLots = await prisma.harvestLot.findMany({
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
    })

    return NextResponse.json({ harvestLots })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/harvest-lots - Create new harvest lot
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Admin'])

    // Validate request body with Zod
    const validation = await validateBody(request, createHarvestLotSchema)
    if (!validation.success) {
      return validation.error
    }

    const { farmerName, cherryVariety, weightKg, farmPlotLocation, harvestDate, status, cropYearId, farmId } = validation.data

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

    const harvestLot = await prisma.harvestLot.create({
      data: {
        farmerName,
        cherryVariety,
        weightKg,
        farmPlotLocation,
        harvestDate: new Date(harvestDate),
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

    return NextResponse.json(
      { harvestLot, message: 'Harvest lot created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

