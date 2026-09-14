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
      select: { createdById: true },
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

    // Whole-lot semantics: the harvest lot was consumed in full when the batch
    // was created, so editing parchmentWeightKg no longer touches it. (The
    // batch's ParchmentLot weights are still not synced here — pre-existing
    // gap, unchanged.)
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

    // Delete the batch and, if it was the last one bound to this cherry lot,
    // hand the lot back. Creating a batch flipped the lot to Complete, so a
    // mistaken batch must reverse that or the lot is stranded (hidden from
    // Cherry Lots but never processed). Legacy lots from the old
    // partial-deduction flow may own several batches: only release once none
    // remain, and clear the legacy remainingWeightKg so the full weightKg
    // shows again (a lot with zero batches has all of its cherry back).
    let harvestLotReleased = false
    await prisma.$transaction(async (tx) => {
      await tx.dryingLogEntry.deleteMany({
        where: { processingBatchId: id },
      })
      await tx.processingBatch.delete({
        where: { id },
      })
      const remainingBatches = await tx.processingBatch.count({
        where: { harvestLotId: batch.harvestLotId },
      })
      if (remainingBatches === 0) {
        const released = await tx.harvestLot.updateMany({
          where: { id: batch.harvestLotId, status: 'Complete' },
          data: { status: 'ReadyForProcessing', remainingWeightKg: null },
        })
        harvestLotReleased = released.count > 0
      }
    })

    return NextResponse.json({
      message: 'Processing batch deleted successfully',
      harvestLotReleased,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
