import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/crop-years/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const cropYear = await prisma.cropYear.findUnique({
      where: { id },
      include: {
        harvestLots: {
          take: 10,
          orderBy: { harvestDate: 'desc' },
        },
        processingBatches: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            harvestLots: true,
            processingBatches: true,
          },
        },
      },
    })

    if (!cropYear) {
      return NextResponse.json(
        { error: 'Crop year not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ cropYear })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/crop-years/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const body = await request.json()
    const { year, startDate, endDate, description } = body

    const updateData: any = {}
    if (year !== undefined) updateData.year = year
    if (startDate !== undefined) updateData.startDate = new Date(startDate)
    if (endDate !== undefined) updateData.endDate = new Date(endDate)
    if (description !== undefined) updateData.description = description

    const updatedCropYear = await prisma.cropYear.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ cropYear: updatedCropYear })
  } catch (error) {
    return handleApiError(error)
  }
}
