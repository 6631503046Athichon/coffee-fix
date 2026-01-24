import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/processing-batches/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await requireAuth(request)

    const processingBatch = await prisma.processingBatch.findUnique({
      where: { id },
      include: {
        harvestLot: {
          include: {
            farm: {
              select: {
                id: true,
                farmName: true,
                location: true,
              },
            },
          },
        },
        cropYear: {
          select: {
            id: true,
            year: true,
          },
        },
        dryingLogs: {
          orderBy: { date: 'asc' },
        },
        parchmentLots: true,
      },
    })

    if (!processingBatch) {
      return NextResponse.json(
        { error: 'Processing batch not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ processingBatch })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/processing-batches/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await requireAuth(request)

    const body = await request.json()
    const { status, processType, processNotes, parchmentWeightKg, moistureContent, baggingDate, dryingStartDate, dryingEndDate, cropYearId } = body

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (processType !== undefined) updateData.processType = processType
    if (processNotes !== undefined) updateData.processNotes = processNotes
    if (parchmentWeightKg !== undefined) updateData.parchmentWeightKg = parchmentWeightKg ? parseFloat(parchmentWeightKg) : null
    if (moistureContent !== undefined) updateData.moistureContent = moistureContent ? parseFloat(moistureContent) : null
    if (baggingDate !== undefined) updateData.baggingDate = baggingDate ? new Date(baggingDate) : null
    if (dryingStartDate !== undefined) updateData.dryingStartDate = dryingStartDate ? new Date(dryingStartDate) : null
    if (dryingEndDate !== undefined) updateData.dryingEndDate = dryingEndDate ? new Date(dryingEndDate) : null
    if (cropYearId !== undefined) updateData.cropYearId = cropYearId

    const updatedBatch = await prisma.processingBatch.update({
      where: { id },
      data: updateData,
      include: {
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
            weightKg: true,
          },
        },
        cropYear: {
          select: {
            id: true,
            year: true,
          },
        },
        dryingLogs: {
          orderBy: { date: 'asc' },
        },
        parchmentLots: true,
      },
    })

    return NextResponse.json({ processingBatch: updatedBatch })
  } catch (error) {
    return handleApiError(error)
  }
}
