import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/soil-analyses/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const soilAnalysis = await prisma.soilAnalysis.findUnique({
      where: { id },
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!soilAnalysis) {
      return NextResponse.json(
        { error: 'Soil analysis not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ soilAnalysis })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/soil-analyses/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const {
      farmPlotLocation,
      testDate,
      labName,
      certificateNumber,
      pH,
      phosphorus,
      potassium,
      nitrogen,
      calcium,
      magnesium,
      organicMatter,
      sulfur,
      zinc,
      iron,
      manganese,
      copper,
      boron,
      notes,
      recommendations,
      attachmentUrl,
    } = body

    const updateData: any = {}
    if (farmPlotLocation !== undefined) updateData.farmPlotLocation = farmPlotLocation
    if (testDate !== undefined) updateData.testDate = new Date(testDate)
    if (labName !== undefined) updateData.labName = labName
    if (certificateNumber !== undefined) updateData.certificateNumber = certificateNumber
    if (pH !== undefined) updateData.pH = parseFloat(pH)
    if (phosphorus !== undefined) updateData.phosphorus = parseFloat(phosphorus)
    if (potassium !== undefined) updateData.potassium = parseFloat(potassium)
    if (nitrogen !== undefined) updateData.nitrogen = parseFloat(nitrogen)
    if (calcium !== undefined) updateData.calcium = parseFloat(calcium)
    if (magnesium !== undefined) updateData.magnesium = parseFloat(magnesium)
    if (organicMatter !== undefined) updateData.organicMatter = organicMatter ? parseFloat(organicMatter) : null
    if (sulfur !== undefined) updateData.sulfur = sulfur ? parseFloat(sulfur) : null
    if (zinc !== undefined) updateData.zinc = zinc ? parseFloat(zinc) : null
    if (iron !== undefined) updateData.iron = iron ? parseFloat(iron) : null
    if (manganese !== undefined) updateData.manganese = manganese ? parseFloat(manganese) : null
    if (copper !== undefined) updateData.copper = copper ? parseFloat(copper) : null
    if (boron !== undefined) updateData.boron = boron ? parseFloat(boron) : null
    if (notes !== undefined) updateData.notes = notes
    if (recommendations !== undefined) updateData.recommendations = recommendations
    if (attachmentUrl !== undefined) updateData.attachmentUrl = attachmentUrl

    const updatedSoilAnalysis = await prisma.soilAnalysis.update({
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
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ soilAnalysis: updatedSoilAnalysis })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/soil-analyses/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const soilAnalysis = await prisma.soilAnalysis.findUnique({
      where: { id },
      include: {
        farm: {
          select: {
            ownerId: true,
          },
        },
      },
    })

    if (!soilAnalysis) {
      return NextResponse.json(
        { error: 'Soil analysis not found' },
        { status: 404 }
      )
    }

    // Check permission - only farm owner or admin can delete
    if (!user.roles.includes('Admin') && soilAnalysis.farm.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    await prisma.soilAnalysis.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Soil analysis deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
