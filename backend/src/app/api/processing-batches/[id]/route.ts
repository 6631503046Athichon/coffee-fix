import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { parseDateOnly, safeParseFloat } from '@/lib/utils'

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
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can update processing batches
    requireRole(user, ['Processor', 'Admin'])

    // SECURITY: Ownership check — only the Processor who created this batch
    // (or Admin) can mutate it. Excel-imported batches fall back to Admin-only.
    const existingBatch = await prisma.processingBatch.findUnique({
      where: { id },
      select: {
        createdById: true,
        harvestLotId: true,
        parchmentWeightKg: true,
      },
    })
    if (!existingBatch) {
      return NextResponse.json(
        { error: 'Processing batch not found' },
        { status: 404 }
      )
    }
    requireOwnership(user, existingBatch.createdById, ['Admin'])

    const body = await request.json()
    const { status, processType, processNotes, parchmentWeightKg, moistureContent, baggingDate, dryingStartDate, dryingEndDate, cropYearId } = body

    // Use UncheckedUpdateInput so we can assign scalar FKs (cropYearId) directly
    // without needing a nested `connect`.
    const updateData: Prisma.ProcessingBatchUncheckedUpdateInput = {}
    if (status !== undefined) updateData.status = status
    if (processType !== undefined) updateData.processType = processType
    if (processNotes !== undefined) updateData.processNotes = processNotes
    let parsedParchmentWeight: number | null = null
    if (parchmentWeightKg !== undefined) {
      parsedParchmentWeight = safeParseFloat(parchmentWeightKg)
      if (parsedParchmentWeight === null || parsedParchmentWeight <= 0) {
        return NextResponse.json(
          { error: 'Parchment weight must be greater than 0' },
          { status: 400 }
        )
      }
      updateData.parchmentWeightKg = parsedParchmentWeight
    }
    if (moistureContent !== undefined) {
      const parsedMoistureContent = safeParseFloat(moistureContent)
      if (parsedMoistureContent === null || parsedMoistureContent < 0 || parsedMoistureContent > 100) {
        return NextResponse.json(
          { error: 'Moisture content must be between 0 and 100' },
          { status: 400 }
        )
      }
      updateData.moistureContent = parsedMoistureContent
    }
    const parsedBaggingDate = baggingDate !== undefined ? parseDateOnly(baggingDate) : undefined
    const parsedDryingStartDate = dryingStartDate !== undefined ? parseDateOnly(dryingStartDate) : undefined
    const parsedDryingEndDate = dryingEndDate !== undefined ? parseDateOnly(dryingEndDate) : undefined

    for (const [field, value] of [
      ['baggingDate', parsedBaggingDate],
      ['dryingStartDate', parsedDryingStartDate],
      ['dryingEndDate', parsedDryingEndDate],
    ] as const) {
      if (value && Number.isNaN(value.getTime())) {
        return NextResponse.json(
          { error: `Invalid ${field} value` },
          { status: 400 }
        )
      }
    }

    const effectiveDryingStart = parsedDryingStartDate !== undefined
      ? parsedDryingStartDate
      : undefined
    const effectiveDryingEnd = parsedDryingEndDate !== undefined
      ? parsedDryingEndDate
      : undefined
    if (effectiveDryingStart && effectiveDryingEnd && effectiveDryingEnd < effectiveDryingStart) {
      return NextResponse.json(
        { error: 'Drying end date cannot be before drying start date' },
        { status: 400 }
      )
    }

    if (baggingDate !== undefined) updateData.baggingDate = parsedBaggingDate
    if (dryingStartDate !== undefined) updateData.dryingStartDate = parsedDryingStartDate
    if (dryingEndDate !== undefined) updateData.dryingEndDate = parsedDryingEndDate
    if (cropYearId !== undefined) updateData.cropYearId = cropYearId

    // Compute the parchmentWeightKg delta vs the previous value. When the
    // batch is bound to a harvestLot we have to apply the delta atomically to
    // harvestLot.remainingWeightKg, otherwise raising parchmentWeightKg would
    // silently allow harvest stock to be double-counted.
    const previousParchmentWeight = existingBatch.parchmentWeightKg ?? 0
    const parchmentDelta =
      parsedParchmentWeight !== null
        ? parsedParchmentWeight - previousParchmentWeight
        : 0

    let updatedBatch
    try {
      updatedBatch = await prisma.$transaction(async (tx) => {
        if (
          parsedParchmentWeight !== null &&
          existingBatch.harvestLotId &&
          parchmentDelta !== 0
        ) {
          if (parchmentDelta > 0) {
            // Need to draw down more harvest stock. Guarded decrement so the
            // update fails (count === 0) if stock is insufficient.
            const dec = await tx.harvestLot.updateMany({
              where: {
                id: existingBatch.harvestLotId,
                remainingWeightKg: { gte: parchmentDelta },
              },
              data: { remainingWeightKg: { decrement: parchmentDelta } },
            })
            if (dec.count === 0) {
              throw new Error('INSUFFICIENT_HARVEST_STOCK')
            }
          } else {
            // parchmentWeightKg was lowered — return stock to the harvest lot.
            await tx.harvestLot.update({
              where: { id: existingBatch.harvestLotId },
              data: { remainingWeightKg: { increment: -parchmentDelta } },
            })
          }
        }

        return tx.processingBatch.update({
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
      })
    } catch (error) {
      if ((error as Error)?.message === 'INSUFFICIENT_HARVEST_STOCK') {
        return NextResponse.json(
          { error: 'INSUFFICIENT_HARVEST_STOCK' },
          { status: 400 }
        )
      }
      throw error
    }

    return NextResponse.json({ processingBatch: updatedBatch })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/processing-batches/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can delete processing batches
    requireRole(user, ['Processor', 'Admin'])

    // Check if batch exists
    const batch = await prisma.processingBatch.findUnique({
      where: { id },
      include: {
        parchmentLots: true,
      },
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Processing batch not found' },
        { status: 404 }
      )
    }

    // SECURITY: Ownership check — only the Processor who created this batch
    // (or Admin) can delete it.
    requireOwnership(user, batch.createdById, ['Admin'])

    // Check if there are parchment lots linked
    if (batch.parchmentLots && batch.parchmentLots.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete processing batch with linked parchment lots. Delete parchment lots first.' },
        { status: 400 }
      )
    }

    // Delete drying logs first
    await prisma.dryingLogEntry.deleteMany({
      where: { processingBatchId: id },
    })

    // Delete the batch
    await prisma.processingBatch.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Processing batch deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
