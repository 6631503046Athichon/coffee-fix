import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'
import { createRoastBatchSchema } from '@/lib/validations/roasting'
import { WEIGHT_EPSILON, isAdminUser, round2, type SaleTx } from '@/lib/saleOrders'

/** Kilograms to the milligram, as the sale and withdrawal routes store stock. */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/** Rewrites a stock row's remainingWeightKg rounded to 6 decimals and at least 0, when it is not already. */
async function tidyRemainingKg(tx: SaleTx, id: string) {
  const row = await tx.roasterInventoryItem.findUnique({
    where: { id },
    select: { remainingWeightKg: true },
  })
  if (!row) return
  const tidy = Math.max(0, round6(row.remainingWeightKg))
  if (tidy !== row.remainingWeightKg) {
    await tx.roasterInventoryItem.update({
      where: { id },
      data: { remainingWeightKg: tidy },
    })
  }
}

// GET /api/roast-batches - List roast batches
// Roasters see only their own batches (?roasterId is ignored for them);
// Admins see every batch and may filter by ?roasterId.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const where: Prisma.RoastBatchWhereInput = {}

    const roasterId = request.nextUrl.searchParams.get('roasterId')
    if (!isAdminUser(user)) {
      where.roasterId = user.id
    } else if (roasterId) {
      where.roasterId = roasterId
    }

    // Filter by greenBeanLotId if provided
    const greenBeanLotId = request.nextUrl.searchParams.get('greenBeanLotId')
    if (greenBeanLotId) {
      where.greenBeanLotId = greenBeanLotId
    }

    const roastBatches = await prisma.roastBatch.findMany({
      where,
      include: {
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
      },
      orderBy: { roastDate: 'desc' },
    })

    return NextResponse.json({ roastBatches })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/roast-batches - Create new roast batch
// Roasters roast their own stock; Admins may roast anyone's, and the batch is
// recorded under the stock's owner. The lot, yield and weight loss come from
// the stock row and the weights, never from the body.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

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
    // yieldPercentage and weightLossPct are not read: they are derived below.
    const parsed = createRoastBatchSchema.safeParse({
      roasterInventoryId: body.roasterInventoryId,
      greenBeanLotId: body.greenBeanLotId ?? undefined,
      batchSizeKg: numeric(body.batchSizeKg),
      roastedWeightKg: numeric(body.roastedWeightKg),
      roastLevel: body.roastLevel === '' ? null : body.roastLevel,
      roastProfileNotes: body.roastProfileNotes ?? undefined,
      flavorNotes: body.flavorNotes,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid roast batch data' },
        { status: 400 }
      )
    }
    const input = parsed.data
    const roasterInventoryId = input.roasterInventoryId

    // Verify roaster owns the inventory
    const inventory = await prisma.roasterInventoryItem.findUnique({
      where: { id: roasterInventoryId },
    })

    if (!inventory) {
      return NextResponse.json(
        { error: 'Roaster inventory not found' },
        { status: 404 }
      )
    }

    if (inventory.roasterId !== user.id && !isAdminUser(user)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // The roast is on the stock row's lot. Another id would put it on a lot
    // the stock never came from (another owner's public trace, and a roast
    // that blocks that owner from deleting their lot).
    if (input.greenBeanLotId !== undefined && input.greenBeanLotId !== inventory.greenBeanLotId) {
      return NextResponse.json(
        { error: 'Green bean lot does not match the roaster inventory item' },
        { status: 400 }
      )
    }

    // Kg to 2 dp, as the Workbench sends them and as the roast PUT rounds
    // them. A batch stored with more decimals would be rounded by its next
    // edit without moving the difference, and its delete would then return
    // more kg than this took: kg out of nothing, a little per round trip.
    const amount = round2(input.batchSizeKg)
    if (!Number.isFinite(amount)) {
      return NextResponse.json(
        { error: 'Invalid batch size' },
        { status: 400 }
      )
    }
    if (amount < 0.01) {
      return NextResponse.json(
        { error: 'Batch size must be at least 0.01 kg' },
        { status: 400 }
      )
    }

    // Yield and weight loss are derived from the roasted weight (as the PUT
    // does), so a roast cannot be logged without one.
    if (input.roastedWeightKg == null) {
      return NextResponse.json({ error: 'Roasted weight is required' }, { status: 400 })
    }
    const roastedKg = round2(input.roastedWeightKg)
    // Roasting only loses weight; more out than in would be sellable roasted
    // kg made from nothing.
    if (roastedKg > amount + WEIGHT_EPSILON) {
      return NextResponse.json(
        { error: 'Roasted weight cannot exceed batch size' },
        { status: 400 }
      )
    }
    const yieldPct = round2((roastedKg / amount) * 100)

    // Stock figures carry float leftovers (5 - 4 x 1.2 is 0.19999...), so the
    // weight checks allow WEIGHT_EPSILON of slack, or the last 0.2 kg could
    // never be roasted.
    if (amount > inventory.remainingWeightKg + WEIGHT_EPSILON) {
      return NextResponse.json(
        { error: 'Insufficient weight in inventory' },
        { status: 400 }
      )
    }

    let roastBatch
    try {
      roastBatch = await prisma.$transaction(async (tx) => {
        // Atomic guarded decrement: two concurrent roasts cannot both pass the
        // up-front weight check and overdraw the inventory item.
        const decResult = await tx.roasterInventoryItem.updateMany({
          where: { id: roasterInventoryId, remainingWeightKg: { gte: amount - WEIGHT_EPSILON } },
          data: { remainingWeightKg: { decrement: amount } },
        })
        if (decResult.count === 0) {
          throw new Error('INSUFFICIENT_INVENTORY')
        }
        // Round what is left to the milligram, never below 0, so no float
        // leftover is stored (the UPDATE above holds the row lock).
        await tidyRemainingKg(tx, roasterInventoryId)

        // The roast belongs to whoever owns the beans: an Admin roasting a
        // roaster's stock records it in that roaster's Roast Logbook, where
        // the roaster can edit, delete and sell it.
        const batch = await tx.roastBatch.create({
          data: {
            roasterId: inventory.roasterId,
            roasterInventoryId,
            greenBeanLotId: inventory.greenBeanLotId,
            batchSizeKg: amount,
            yieldPercentage: yieldPct,
            roastedWeightKg: roastedKg,
            weightLossPct: round2(100 - yieldPct),
            roastLevel: input.roastLevel ?? null,
            roastProfileNotes: input.roastProfileNotes.trim() || 'No notes',
            flavorNotes: input.flavorNotes?.trim() || null,
          },
        })

        return batch
      })
    } catch (error) {
      if ((error as Error)?.message === 'INSUFFICIENT_INVENTORY') {
        return NextResponse.json(
          { error: 'Insufficient weight in inventory' },
          { status: 400 }
        )
      }
      throw error
    }

    const fullBatch = await prisma.roastBatch.findUnique({
      where: { id: roastBatch.id },
      include: {
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
      },
    })

    return NextResponse.json(
      { roastBatch: fullBatch, message: 'Roast batch created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

