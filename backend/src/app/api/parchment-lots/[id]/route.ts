import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { parseStrictNumber, safeParseFloat } from '@/lib/utils'
import {
  LOT_CHANGED,
  LOT_CHANGED_MESSAGE,
  belowOutMessage,
  describeDependents,
  hasDependents,
  reweighLot,
  type ReweighResult,
} from '@/lib/lotCorrections'
import { batchLabel, chainScope, requireInScope } from '@/lib/farmAccess'

// PATCH /api/parchment-lots/:id - Correct a parchment lot's weight or moisture
//
// The lot's weight is its initialWeightKg; the kg left (currentWeightKg) and
// the status follow from it and from what was already withdrawn or hulled,
// so neither is set directly. For a batch's only lot, the batch's parchment
// weight and moisture follow too: they describe the same parchment.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can update parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // SECURITY: Ownership check — only the Processor who created the parent
    // ProcessingBatch (or Admin) can mutate this parchment lot. Excel-imported
    // lots that have no processingBatch fall back to Admin-only.
    const existing = await prisma.parchmentLot.findUnique({
      where: { id },
      select: {
        initialWeightKg: true,
        currentWeightKg: true,
        processingBatchId: true,
        processingBatch: {
          select: {
            createdById: true,
            _count: { select: { parchmentLots: true } },
            // The cherry it came from caps the parchment, as on create.
            harvestLot: { select: { weightKg: true } },
          },
        },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Parchment lot not found' }, { status: 404 })
    }
    requireOwnership(user, existing.processingBatch?.createdById, ['Admin'])

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const fields = body as Record<string, unknown>

    if (fields.currentWeightKg !== undefined || fields.status !== undefined) {
      return NextResponse.json(
        {
          error: 'The kg left and the status follow from the lot weight and its withdrawals; send initialWeightKg to correct the weight',
        },
        { status: 400 }
      )
    }

    let newWeight: number | null = null
    if (fields.initialWeightKg !== undefined) {
      newWeight = parseStrictNumber(fields.initialWeightKg)
      if (newWeight === null || newWeight <= 0) {
        return NextResponse.json(
          { error: 'Weight must be greater than 0' },
          { status: 400 }
        )
      }
    }
    let newMoisture: number | null = null
    if (fields.moistureContent !== undefined) {
      newMoisture = safeParseFloat(fields.moistureContent)
      if (newMoisture === null || newMoisture < 0 || newMoisture > 100) {
        return NextResponse.json(
          { error: 'Moisture content must be between 0 and 100' },
          { status: 400 }
        )
      }
    }
    if (newWeight === null && newMoisture === null) {
      return NextResponse.json(
        { error: 'Send initialWeightKg or moistureContent to update' },
        { status: 400 }
      )
    }

    // The batch's only lot is the batch's whole output: keep the two in step.
    const syncBatchId =
      existing.processingBatchId && existing.processingBatch?._count?.parchmentLots === 1
        ? existing.processingBatchId
        : null

    let reweigh: Extract<ReweighResult, { ok: true }> | null = null
    if (newWeight !== null && Math.abs(existing.initialWeightKg - newWeight) > 1e-9) {
      const cherryWeight = existing.processingBatch?.harvestLot?.weightKg
      if (syncBatchId && typeof cherryWeight === 'number' && newWeight > cherryWeight) {
        return NextResponse.json(
          {
            error: `Parchment weight (${newWeight.toFixed(2)} kg) cannot exceed the cherry lot weight (${cherryWeight.toFixed(2)} kg).`,
          },
          { status: 400 }
        )
      }
      const result = reweighLot(existing, newWeight)
      if (!result.ok) {
        return NextResponse.json(
          { error: belowOutMessage('parchment lot', result.outKg), withdrawnKg: result.outKg },
          { status: 409 }
        )
      }
      reweigh = result
    }

    let parchmentLot
    try {
      parchmentLot = await prisma.$transaction(async (tx) => {
        if (reweigh) {
          // Guarded on the weights as read: a withdrawal in between makes
          // this match nothing instead of being overwritten.
          const guarded = await tx.parchmentLot.updateMany({
            where: {
              id,
              initialWeightKg: existing.initialWeightKg,
              currentWeightKg: existing.currentWeightKg,
            },
            data: {
              initialWeightKg: reweigh.initialWeightKg,
              currentWeightKg: reweigh.currentWeightKg,
              status: reweigh.depleted ? 'Hulled' : 'AwaitingHulling',
            },
          })
          if (guarded.count === 0) throw new Error(LOT_CHANGED)
        }
        if (syncBatchId) {
          const batchData: Prisma.ProcessingBatchUncheckedUpdateInput = {}
          if (reweigh) batchData.parchmentWeightKg = reweigh.initialWeightKg
          if (newMoisture !== null) batchData.moistureContent = newMoisture
          if (Object.keys(batchData).length > 0) {
            await tx.processingBatch.update({ where: { id: syncBatchId }, data: batchData })
          }
        }

        const updateData: Prisma.ParchmentLotUpdateInput = {}
        if (newMoisture !== null) updateData.moistureContent = newMoisture
        return tx.parchmentLot.update({
          where: { id },
          data: updateData,
          include: {
            processingBatch: {
              include: {
                harvestLot: true,
              },
            },
          },
        })
      })
    } catch (error) {
      if ((error as Error)?.message === LOT_CHANGED) {
        return NextResponse.json({ error: LOT_CHANGED_MESSAGE }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ parchmentLot, message: 'Parchment lot updated successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/parchment-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const scope = await chainScope(user)

    const parchmentLot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        processingBatch: {
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
          },
        },
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
            farmId: true,
          },
        },
        physicalTestResults: true,
        // Only the green-bean lots the user may read (lib/farmAccess).
        greenBeanLots: scope ? { where: scope.greenBeanLotWhere } : true,
      },
    })

    if (!parchmentLot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    // Each their own, as on the list (lib/farmAccess chainScope): a lot
    // outside the user's share is a 403.
    if (scope) {
      requireInScope(await prisma.parchmentLot.findFirst({
        where: { id, AND: [scope.parchmentLotWhere] },
        select: { id: true },
      }))
    }

    // A roaster reads the lot only as the source of their green beans: its
    // batch comes as a label, not the processor's record.
    const batch = parchmentLot.processingBatch
    if (scope && batch && !scope.canReadBatch(batch)) {
      return NextResponse.json({ parchmentLot: { ...parchmentLot, processingBatch: batchLabel(batch) } })
    }

    return NextResponse.json({ parchmentLot })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/parchment-lots/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can delete parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // Check if lot exists
    const lot = await prisma.parchmentLot.findUnique({
      where: { id },
      select: {
        processingBatch: { select: { createdById: true } },
        // A voided withdrawal (D7) never happened: it goes with the lot.
        _count: { select: { greenBeanLots: true, withdrawalHistory: { where: { voidedAt: null } } } },
      },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Ownership check — only the Processor who created the parent
    // ProcessingBatch (or Admin) can delete this parchment lot.
    requireOwnership(user, lot.processingBatch?.createdById, ['Admin'])

    // Withdrawals (sales included) cascade with the lot and its green-bean
    // lots would lose their source, so a lot anything was drawn from is not
    // deleted, for Admin too: the counts come back instead.
    const dependents = {
      greenBeanLots: lot._count?.greenBeanLots ?? 0,
      withdrawals: lot._count?.withdrawalHistory ?? 0,
    }
    if (hasDependents(dependents)) {
      return NextResponse.json(
        {
          error: `This parchment lot already has ${describeDependents(dependents)}, so it was not deleted`,
          dependents,
        },
        { status: 409 }
      )
    }

    // PhysicalTestResults cascade on delete in the schema. The delete repeats
    // the "nothing drawn from it" rule, so a withdrawal or Hull & Grade that
    // lands after the check above makes it match nothing.
    const deleted = await prisma.parchmentLot.deleteMany({
      where: {
        id,
        greenBeanLots: { none: {} },
        withdrawalHistory: { none: { voidedAt: null } },
      },
    })
    if (deleted.count === 0) {
      const stillThere = await prisma.parchmentLot.findUnique({
        where: { id },
        select: { id: true },
      })
      if (!stillThere) {
        return NextResponse.json({ error: 'Parchment lot not found' }, { status: 404 })
      }
      return NextResponse.json(
        { error: 'This parchment lot was drawn from since you looked, so it was not deleted. Reload and try again.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ message: 'Parchment lot deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
