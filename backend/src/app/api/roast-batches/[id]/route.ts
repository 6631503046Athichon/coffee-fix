import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'
import { updateRoastBatchSchema } from '@/lib/validations/roasting'
import { formatKgText, isPrismaCode } from '@/lib/saleOrders'

const roastBatchInclude = {
  roaster: {
    select: {
      id: true,
      name: true,
    },
  },
  greenBeanLot: {
    select: {
      id: true,
      grade: true,
      sourceType: true,
    },
  },
  roasterInventory: {
    select: {
      id: true,
      claimedWeightKg: true,
      remainingWeightKg: true,
    },
  },
} satisfies Prisma.RoastBatchInclude

const round2 = (value: number) => Math.round(value * 100) / 100
// Stock figures carry binary noise from earlier decrements (0.3 - 0.1 is
// 0.19999999999999998), so weight comparisons allow a hair of slack.
const WEIGHT_EPSILON = 1e-6

// Wording stays clear of "changed or removed by someone else" and of
// "Roast batch not found", so the roast dialog shows it inline instead of
// closing and reloading.
const soldExceedsMessage = (soldKg: number) =>
  `Roasted weight cannot be less than the ${formatKgText(soldKg)} kg already sold from this roast.`

// Sales hold roasted kg on this roast; the guarded update found more sold
// than the new roasted weight allows.
class SoldExceedsError extends Error {
  constructor(public soldKg: number) {
    super('SOLD_EXCEEDS')
  }
}

// The sales a roast is on, for the delete refusal. null when there are none.
async function saleConflictMessage(roastBatchId: string): Promise<string | null> {
  const lines = await prisma.saleOrderItem.findMany({
    where: { roastBatchId },
    select: { saleOrder: { select: { orderNumber: true } } },
    take: 6,
  })
  if (lines.length === 0) return null
  const orderNumbers = Array.from(new Set(lines.map((line) => line.saleOrder.orderNumber)))
  const shown = orderNumbers.slice(0, 5).join(', ')
  const more = orderNumbers.length > 5 || lines.length > 5
  return `This roast is on sale ${shown}${more ? ', …' : ''}. Delete those sales, or move them to another roast, before deleting it.`
}

// PUT /api/roast-batches/:id - Correct a roast batch
// Changing the batch size moves the difference in or out of the roaster's
// inventory row in the same transaction, so stock always matches the log.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])
    const { id } = await params

    const existing = await prisma.roastBatch.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Roast batch not found' }, { status: 404 })
    }
    requireOwnership(user, existing.roasterId, ['Admin'])

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // Numbers may arrive as strings from a form; normalise before validating.
    // A value that is present but not a number is an error, never "not provided".
    const numeric = (value: unknown) => {
      if (value === undefined || value === null) return value
      return safeParseFloat(value) ?? NaN
    }
    const parsed = updateRoastBatchSchema.safeParse({
      roastDate: body.roastDate,
      batchSizeKg: numeric(body.batchSizeKg) ?? undefined,
      roastedWeightKg: numeric(body.roastedWeightKg),
      roastLevel: body.roastLevel,
      roastProfileNotes: body.roastProfileNotes,
      flavorNotes: body.flavorNotes,
      expectedUpdatedAt: body.expectedUpdatedAt,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid roast batch data' },
        { status: 400 }
      )
    }
    const input = parsed.data

    // A form opened before someone else corrected this roast would silently
    // overwrite their change; refuse it so the client can reload first.
    if (
      input.expectedUpdatedAt !== undefined &&
      new Date(input.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()
    ) {
      return NextResponse.json(
        { error: 'This roast was changed or removed by someone else. Reload and try again.' },
        { status: 409 }
      )
    }

    const newBatchKg = round2(input.batchSizeKg ?? existing.batchSizeKg)
    const newRoastedKg =
      input.roastedWeightKg === undefined
        ? existing.roastedWeightKg
        : input.roastedWeightKg == null
          ? null
          : round2(input.roastedWeightKg)

    // Yield and weight loss are derived from the roasted weight, so a roast
    // cannot be left without one: the derived figures would go stale.
    if (newRoastedKg == null) {
      return NextResponse.json({ error: 'Roasted weight is required' }, { status: 400 })
    }
    if (newRoastedKg > newBatchKg + WEIGHT_EPSILON) {
      return NextResponse.json(
        { error: 'Roasted weight cannot exceed batch size' },
        { status: 400 }
      )
    }
    // Sales hold kg of this roast; it cannot shrink below what they hold.
    if (newRoastedKg < (existing.soldWeightKg ?? 0) - WEIGHT_EPSILON) {
      return NextResponse.json({ error: soldExceedsMessage(existing.soldWeightKg) }, { status: 400 })
    }

    let roastDate: Date | undefined
    if (input.roastDate !== undefined) {
      roastDate = new Date(input.roastDate)
      // A day of slack covers clients ahead of the server's timezone.
      if (roastDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Roast date cannot be in the future' }, { status: 400 })
      }
    }

    const data: Prisma.RoastBatchUpdateManyMutationInput = {
      batchSizeKg: newBatchKg,
      roastedWeightKg: newRoastedKg,
    }
    // Yield and weight loss are derived, so they never drift from the weights.
    const yieldPct = round2((newRoastedKg / newBatchKg) * 100)
    data.yieldPercentage = yieldPct
    data.weightLossPct = round2(100 - yieldPct)
    if (roastDate) data.roastDate = roastDate
    if (input.roastLevel !== undefined) data.roastLevel = input.roastLevel
    if (input.roastProfileNotes !== undefined) {
      data.roastProfileNotes = input.roastProfileNotes.trim() || 'No notes'
    }
    if (input.flavorNotes !== undefined) data.flavorNotes = input.flavorNotes?.trim() || null

    const delta = round2(newBatchKg - existing.batchSizeKg)

    let roastBatch
    try {
      roastBatch = await prisma.$transaction(async (tx) => {
        // Optimistic check on the row as it was read: an edit or delete that
        // landed in between would otherwise be overwritten, or have its stock
        // delta applied twice. Sales never bump updatedAt (they write the sold
        // counter with raw SQL), so the sold guard re-checks what they hold.
        const updated = await tx.roastBatch.updateMany({
          where: {
            id,
            updatedAt: existing.updatedAt,
            soldWeightKg: { lte: newRoastedKg + WEIGHT_EPSILON },
          },
          data,
        })
        if (updated.count === 0) {
          const fresh = await tx.roastBatch.findUnique({
            where: { id },
            select: { updatedAt: true, soldWeightKg: true },
          })
          if (fresh && fresh.updatedAt.getTime() === existing.updatedAt.getTime()) {
            throw new SoldExceedsError(fresh.soldWeightKg)
          }
          throw new Error('ROAST_CHANGED')
        }

        if (delta > 0) {
          // Guarded decrement, same pattern as creating a roast.
          const dec = await tx.roasterInventoryItem.updateMany({
            where: {
              id: existing.roasterInventoryId,
              remainingWeightKg: { gte: delta - WEIGHT_EPSILON },
            },
            data: { remainingWeightKg: { decrement: delta } },
          })
          if (dec.count === 0) {
            throw new Error('INSUFFICIENT_INVENTORY')
          }
        } else if (delta < 0) {
          await tx.roasterInventoryItem.update({
            where: { id: existing.roasterInventoryId },
            data: { remainingWeightKg: { increment: -delta } },
          })
        }

        // Read back inside the transaction: a delete racing past the commit
        // would otherwise turn this into a 200 with no roast in it.
        return tx.roastBatch.findUnique({ where: { id }, include: roastBatchInclude })
      })
    } catch (error) {
      if (error instanceof SoldExceedsError) {
        return NextResponse.json({ error: soldExceedsMessage(error.soldKg) }, { status: 400 })
      }
      const message = (error as Error)?.message
      if (message === 'INSUFFICIENT_INVENTORY') {
        return NextResponse.json(
          { error: 'Insufficient weight in inventory for the larger batch size' },
          { status: 400 }
        )
      }
      if (message === 'ROAST_CHANGED') {
        return NextResponse.json(
          { error: 'This roast was changed or removed by someone else. Reload and try again.' },
          { status: 409 }
        )
      }
      throw error
    }

    if (!roastBatch) {
      return NextResponse.json({ error: 'Roast batch not found' }, { status: 404 })
    }

    return NextResponse.json({ roastBatch, message: 'Roast batch updated successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/roast-batches/:id - Remove a roast batch logged by mistake
// The green beans it used go back to the roaster's inventory row.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])
    const { id } = await params

    const existing = await prisma.roastBatch.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Roast batch not found' }, { status: 404 })
    }
    requireOwnership(user, existing.roasterId, ['Admin'])

    // Sale lines point at this roast (the foreign key is Restrict), so the
    // sales have to go, or move to another roast, first.
    const onSale = await saleConflictMessage(id)
    if (onSale) {
      return NextResponse.json({ error: onSale }, { status: 409 })
    }

    let updatedInventory
    try {
      updatedInventory = await prisma.$transaction(async (tx) => {
        // Delete first: a repeated request fails here (P2025 -> 404) and rolls
        // back, so the beans can never be returned to stock twice.
        const removed = await tx.roastBatch.delete({ where: { id } })
        return tx.roasterInventoryItem.update({
          where: { id: removed.roasterInventoryId },
          data: { remainingWeightKg: { increment: removed.batchSizeKg } },
          select: { id: true, claimedWeightKg: true, remainingWeightKg: true },
        })
      })
    } catch (error) {
      // A sale took this roast between the check above and the delete.
      // handleApiError would call P2003 an 'Invalid reference' 400.
      if (isPrismaCode(error, 'P2003')) {
        const message =
          (await saleConflictMessage(id)) ??
          'This roast is on a sale. Delete that sale, or move it to another roast, before deleting it.'
        return NextResponse.json({ error: message }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ updatedInventory, message: 'Roast batch deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
