import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { parseDateOnly } from '@/lib/utils'

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

    const updateData: Prisma.CropYearUpdateInput = {}
    if (year !== undefined) updateData.year = year
    if (startDate !== undefined) {
      const parsed = parseDateOnly(startDate)
      if (parsed === null || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
      }
      updateData.startDate = parsed
    }
    if (endDate !== undefined) {
      const parsed = parseDateOnly(endDate)
      if (parsed === null || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 })
      }
      updateData.endDate = parsed
    }
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
