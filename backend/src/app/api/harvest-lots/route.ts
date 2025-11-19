import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/harvest-lots - List all harvest lots
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: any = {}
    
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

    const body = await request.json()
    const { farmerName, cherryVariety, weightKg, farmPlotLocation, harvestDate, status, cropYearId, farmId } = body

    // Validation
    if (!farmerName || !cherryVariety || !weightKg || !farmPlotLocation || !harvestDate) {
      return NextResponse.json(
        { error: 'Farmer name, cherry variety, weight, farm plot location, and harvest date are required' },
        { status: 400 }
      )
    }

    // Validate cropYearId if provided
    let validCropYearId = null
    if (cropYearId && typeof cropYearId === 'string' && cropYearId.trim() !== '') {
      const trimmedId = cropYearId.trim()
      
      // Try to find crop year by ID (UUID)
      const cropYear = await prisma.cropYear.findUnique({
        where: { id: trimmedId },
      })
      
      if (!cropYear) {
        return NextResponse.json(
          { error: 'Crop year not found' },
          { status: 400 }
        )
      }
      validCropYearId = trimmedId
    }

    const harvestLot = await prisma.harvestLot.create({
      data: {
        farmerName,
        cherryVariety,
        weightKg: parseFloat(weightKg),
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

