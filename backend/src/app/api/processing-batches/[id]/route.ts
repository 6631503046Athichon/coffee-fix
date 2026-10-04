import { NextRequest, NextResponse } from 'next/server'
import { Prisma, type ProcessingBatchStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { parseDateOnly, parseStrictNumber, safeParseFloat } from '@/lib/utils'
import {
  LOT_CHANGED,
  LOT_CHANGED_MESSAGE,
  belowOutMessage,
  describeDependents,
  hasDependents,
  reweighLot,
  type ReweighResult,
} from '@/lib/lotCorrections'

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

const BATCH_STATUSES: readonly string[] = ['ToProcess', 'Drying', 'Completed']

// Thrown inside the delete transaction when what hangs off the batch changed
// after it was read. Mapped to 409.
const DEPENDENTS_CHANGED = 'DEPENDENTS_CHANGED'

const batchResponseInclude = {
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
} satisfies Prisma.ProcessingBatchInclude

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
        parchmentWeightKg: true,
        dryingStartDate: true,
        dryingEndDate: true,
        // The cherry it came from caps the parchment, as on create.
        harvestLot: { select: { weightKg: true } },
        // The batch's parchment output. Its weight, moisture and process
        // type follow the batch, so a correction here reaches the lot too.
        parchmentLots: {
          select: { id: true, initialWeightKg: true, currentWeightKg: true },
        },
      },
    })
    if (!existingBatch) {
      return NextResponse.json(
        { error: 'Processing batch not found' },
        { status: 404 }
      )
    }
    requireOwnership(user, existingBatch.createdById, ['Admin'])

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { status, processType, processNotes, parchmentWeightKg, moistureContent, baggingDate, dryingStartDate, dryingEndDate, cropYearId } = body as Record<string, unknown>

    // Use UncheckedUpdateInput so we can assign scalar FKs (cropYearId) directly
    // without needing a nested `connect`.
    const updateData: Prisma.ProcessingBatchUncheckedUpdateInput = {}
    if (status !== undefined) {
      if (typeof status !== 'string' || !BATCH_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
      }
      updateData.status = status as ProcessingBatchStatus
    }
    let nextProcessType: string | undefined
    if (processType !== undefined) {
      const name = typeof processType === 'string' ? processType.trim() : ''
      if (!name || name.length > 100) {
        return NextResponse.json(
          { error: 'Process type is required and must be at most 100 characters' },
          { status: 400 }
        )
      }
      nextProcessType = name
      updateData.processType = name
    }
    if (processNotes !== undefined) {
      if (processNotes !== null && typeof processNotes !== 'string') {
        return NextResponse.json({ error: 'Invalid processNotes value' }, { status: 400 })
      }
      const notes = typeof processNotes === 'string' ? processNotes.trim() : ''
      if (notes.length > 1000) {
        return NextResponse.json(
          { error: 'Process notes must be at most 1000 characters' },
          { status: 400 }
        )
      }
      updateData.processNotes = notes || null
    }
    let parsedParchmentWeight: number | null = null
    if (parchmentWeightKg !== undefined) {
      parsedParchmentWeight = parseStrictNumber(parchmentWeightKg)
      if (parsedParchmentWeight === null || parsedParchmentWeight <= 0) {
        return NextResponse.json(
          { error: 'Parchment weight must be greater than 0' },
          { status: 400 }
        )
      }
      // Parchment is the measured output of the whole cherry lot, so it can
      // never weigh more than that lot (the same rule as on create).
      const cherryWeight = existingBatch.harvestLot?.weightKg
      if (typeof cherryWeight === 'number' && parsedParchmentWeight > cherryWeight) {
        return NextResponse.json(
          {
            error: `Parchment weight (${parsedParchmentWeight.toFixed(2)} kg) cannot exceed the cherry lot weight (${cherryWeight.toFixed(2)} kg).`,
          },
          { status: 400 }
        )
      }
      updateData.parchmentWeightKg = parsedParchmentWeight
    }
    let parsedMoistureContent: number | null = null
    if (moistureContent !== undefined) {
      parsedMoistureContent = safeParseFloat(moistureContent)
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

    // When either drying date changes, the pair as it will be stored must
    // stay in order: a date left out keeps its stored value.
    if (parsedDryingStartDate !== undefined || parsedDryingEndDate !== undefined) {
      const effectiveDryingStart = parsedDryingStartDate !== undefined
        ? parsedDryingStartDate
        : existingBatch.dryingStartDate
      const effectiveDryingEnd = parsedDryingEndDate !== undefined
        ? parsedDryingEndDate
        : existingBatch.dryingEndDate
      if (effectiveDryingStart && effectiveDryingEnd && effectiveDryingEnd < effectiveDryingStart) {
        return NextResponse.json(
          { error: 'Drying end date cannot be before drying start date' },
          { status: 400 }
        )
      }
    }

    if (baggingDate !== undefined) updateData.baggingDate = parsedBaggingDate
    if (dryingStartDate !== undefined) updateData.dryingStartDate = parsedDryingStartDate
    if (dryingEndDate !== undefined) updateData.dryingEndDate = parsedDryingEndDate
    if (cropYearId !== undefined) {
      if (cropYearId !== null && typeof cropYearId !== 'string') {
        return NextResponse.json({ error: 'Invalid cropYearId value' }, { status: 400 })
      }
      updateData.cropYearId = cropYearId || null
    }

    // Whole-lot semantics: the harvest lot was consumed in full when the batch
    // was created, so editing parchmentWeightKg never touches it. The batch's
    // parchment lot does follow: it is the same parchment. Its weight moves
    // with the batch's, but never below what was already withdrawn or hulled
    // from it, so the kg left moves by the same amount.
    const parchmentLots = existingBatch.parchmentLots ?? []
    const onlyLot = parchmentLots.length === 1 ? parchmentLots[0] : null
    let reweigh: {
      lot: (typeof parchmentLots)[number]
      to: Extract<ReweighResult, { ok: true }>
    } | null = null
    if (parsedParchmentWeight !== null) {
      if (parchmentLots.length > 1 && parsedParchmentWeight !== existingBatch.parchmentWeightKg) {
        // Legacy batches split into several lots: which one changes is not
        // the batch's to say.
        return NextResponse.json(
          {
            error: `This batch has ${parchmentLots.length} parchment lots, so its parchment weight is corrected on each lot instead`,
          },
          { status: 409 }
        )
      }
      if (onlyLot && Math.abs(onlyLot.initialWeightKg - parsedParchmentWeight) > 1e-9) {
        const result = reweighLot(onlyLot, parsedParchmentWeight)
        if (!result.ok) {
          return NextResponse.json(
            { error: belowOutMessage('batch\'s parchment', result.outKg), withdrawnKg: result.outKg },
            { status: 409 }
          )
        }
        reweigh = { lot: onlyLot, to: result }
      }
    }
    const syncMoisture = parsedMoistureContent !== null && onlyLot !== null

    let updatedBatch
    try {
      updatedBatch = await prisma.$transaction(async (tx) => {
        if (nextProcessType !== undefined && parchmentLots.length > 0) {
          await tx.parchmentLot.updateMany({
            where: { processingBatchId: id },
            data: { processType: nextProcessType },
          })
        }
        if (reweigh) {
          // Guarded on the weights as read: a withdrawal in between makes
          // this match nothing instead of being overwritten.
          const guarded = await tx.parchmentLot.updateMany({
            where: {
              id: reweigh.lot.id,
              initialWeightKg: reweigh.lot.initialWeightKg,
              currentWeightKg: reweigh.lot.currentWeightKg,
            },
            data: {
              initialWeightKg: reweigh.to.initialWeightKg,
              currentWeightKg: reweigh.to.currentWeightKg,
              status: reweigh.to.depleted ? 'Hulled' : 'AwaitingHulling',
              ...(syncMoisture && { moistureContent: parsedMoistureContent as number }),
            },
          })
          if (guarded.count === 0) throw new Error(LOT_CHANGED)
        } else if (syncMoisture && onlyLot) {
          await tx.parchmentLot.update({
            where: { id: onlyLot.id },
            data: { moistureContent: parsedMoistureContent as number },
          })
        }

        return tx.processingBatch.update({
          where: { id },
          data: updateData,
          include: batchResponseInclude,
        })
      })
    } catch (error) {
      if ((error as Error)?.message === LOT_CHANGED) {
        return NextResponse.json({ error: LOT_CHANGED_MESSAGE }, { status: 409 })
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
      select: {
        createdById: true,
        harvestLotId: true,
        parchmentLots: {
          select: {
            id: true,
            // A voided withdrawal (D7) never happened: it goes with the lot.
            _count: { select: { withdrawalHistory: { where: { voidedAt: null } }, greenBeanLots: true } },
          },
        },
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

    // The batch's parchment output goes with it, but only while nothing has
    // drawn on it. Once parchment was withdrawn, hulled into green beans or
    // sold, deleting would erase those records, so the counts come back
    // instead (for Admin too) and those are corrected first.
    const parchmentLots = batch.parchmentLots ?? []
    const dependents = {
      withdrawals: parchmentLots.reduce((sum, lot) => sum + (lot._count?.withdrawalHistory ?? 0), 0),
      greenBeanLots: parchmentLots.reduce((sum, lot) => sum + (lot._count?.greenBeanLots ?? 0), 0),
    }
    if (hasDependents(dependents)) {
      return NextResponse.json(
        {
          error: `This batch's parchment already has ${describeDependents(dependents)}, so the batch was not deleted`,
          dependents: { parchmentLots: parchmentLots.length, ...dependents },
        },
        { status: 409 }
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
    try {
      await prisma.$transaction(async (tx) => {
        if (parchmentLots.length > 0) {
          const removed = await tx.parchmentLot.deleteMany({
            where: {
              processingBatchId: id,
              withdrawalHistory: { none: { voidedAt: null } },
              greenBeanLots: { none: {} },
            },
          })
          if (removed.count !== parchmentLots.length) throw new Error(DEPENDENTS_CHANGED)
        }
        // Parchment lots cascade with the batch, so one linked since the read
        // (with its withdrawals) must stop the delete rather than go with it.
        const linkedSince = await tx.parchmentLot.count({
          where: { processingBatchId: id },
        })
        if (linkedSince > 0) throw new Error(DEPENDENTS_CHANGED)

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
    } catch (error) {
      if ((error as Error)?.message === DEPENDENTS_CHANGED) {
        return NextResponse.json(
          { error: 'What is linked to this batch changed since you looked, so it was not deleted. Reload and try again.' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({
      message: 'Processing batch deleted successfully',
      harvestLotReleased,
      parchmentLotsDeleted: parchmentLots.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
