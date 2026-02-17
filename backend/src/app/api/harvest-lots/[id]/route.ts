import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'

// GET /api/harvest-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await requireAuth(request)

    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id },
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
        processingBatches: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ harvestLot })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/harvest-lots/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    // Get the harvest lot to check ownership
    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id },
      select: { createdById: true }
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Check ownership - only the creator (Farmer) or Admin can update
    requireOwnership(user, harvestLot.createdById, ['Admin'])

    const body = await request.json()
    const { farmerName, cherryVariety, weightKg, farmPlotLocation, harvestDate, status, cropYearId, farmId } = body

    const updateData: any = {}
    if (farmerName !== undefined) updateData.farmerName = farmerName
    if (cherryVariety !== undefined) updateData.cherryVariety = cherryVariety
    if (weightKg !== undefined) {
      const weight = safeParseFloat(weightKg)
      if (weight !== null) updateData.weightKg = weight
    }
    if (farmPlotLocation !== undefined) updateData.farmPlotLocation = farmPlotLocation
    if (harvestDate !== undefined) updateData.harvestDate = new Date(harvestDate)
    if (status !== undefined) updateData.status = status
    if (cropYearId !== undefined) updateData.cropYearId = cropYearId
    if (farmId !== undefined) updateData.farmId = farmId

    const updatedHarvestLot = await prisma.harvestLot.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ harvestLot: updatedHarvestLot })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/harvest-lots/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    // Get the harvest lot to check ownership
    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id },
      select: { createdById: true }
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Check ownership - only the creator (Farmer) or Admin can delete
    requireOwnership(user, harvestLot.createdById, ['Admin'])

    await prisma.harvestLot.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Harvest lot deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
