import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'
import { SALE_TX_OPTIONS, WEIGHT_EPSILON, formatKgText, round3 } from '@/lib/saleOrders'

// Refusals raised inside the PUT's transaction, so they roll it back.
class ClaimedBelowHeldError extends Error {
  constructor(public held: number) {
    super(`Claimed weight cannot be less than the ${formatKgText(held)} kg that sales hold of this lot.`)
    this.name = 'ClaimedBelowHeldError'
  }
}

class HeldBySalesError extends Error {
  constructor(public cap: number, public held: number) {
    super(
      `Remaining weight can be at most ${formatKgText(cap)} kg because sales hold ${formatKgText(held)} kg of this lot.`,
    )
    this.name = 'HeldBySalesError'
  }
}

class ExceedsClaimedError extends Error {
  constructor() {
    super('remainingWeightKg cannot exceed claimedWeightKg')
    this.name = 'ExceedsClaimedError'
  }
}

// GET /api/roaster-inventory/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])
    const { id } = await params

    const inventoryItem = await prisma.roasterInventoryItem.findUnique({
      where: { id },
      include: {
        roaster: {
          select: {
            id: true,
            name: true,
          },
        },
        greenBeanLot: {
          include: {
            parchmentLot: {
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
              },
            },
            priceSetter: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        roastBatches: {
          orderBy: { roastDate: 'desc' },
        },
      },
    })

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      )
    }

    // SECURITY: a Roaster reads only their own inventory and roasts.
    requireOwnership(user, inventoryItem.roasterId, ['Admin'])

    return NextResponse.json({ inventoryItem })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/roaster-inventory/:id - Correct a stock row's claimed or remaining kg
// Green-bean sales that are not Cancelled already took their kg out of
// remainingWeightKg, so the row must keep room for them: claimed >= held and
// remaining + held <= claimed.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])
    const { id } = await params

    const inventoryItem = await prisma.roasterInventoryItem.findUnique({
      where: { id },
      select: { roasterId: true },
    })

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      )
    }

    // SECURITY: a Roaster edits only their own stock.
    requireOwnership(user, inventoryItem.roasterId, ['Admin'])

    const body = await request.json()
    const { claimedWeightKg, remainingWeightKg } = body

    const updateData: Prisma.RoasterInventoryItemUpdateInput = {}

    // Use safeParseFloat + Number.isFinite so a junk payload like
    // `{ remainingWeightKg: 'abc' }` doesn't silently store NaN in the DB
    // (Prisma writes through to a Float column, and once NaN lands there
    // every downstream math operation poisons too).
    let nextClaimed: number | null = null
    if (claimedWeightKg !== undefined) {
      const parsed = safeParseFloat(claimedWeightKg)
      if (parsed === null || !Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'Invalid claimedWeightKg' },
          { status: 400 }
        )
      }
      nextClaimed = parsed
      updateData.claimedWeightKg = parsed
    }

    let nextRemaining: number | null = null
    if (remainingWeightKg !== undefined) {
      const parsed = safeParseFloat(remainingWeightKg)
      if (parsed === null || !Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'Invalid remainingWeightKg' },
          { status: 400 }
        )
      }
      nextRemaining = parsed
      updateData.remainingWeightKg = parsed
    }

    const updatedItem = await prisma.$transaction(async (tx) => {
      // NO KEY UPDATE, not UPDATE: it serialises with every stock write (sale
      // takes and returns, roasts, claims) but not with the KEY SHARE locks
      // that in-flight sale-line and roast inserts hold on this row, which a
      // plain FOR UPDATE would wait behind.
      await tx.$queryRaw`SELECT "id" FROM "RoasterInventoryItem" WHERE "id" = ${id} FOR NO KEY UPDATE`
      const fresh = await tx.roasterInventoryItem.findUnique({
        where: { id },
        select: { claimedWeightKg: true, remainingWeightKg: true },
      })
      if (!fresh) return null

      // Kg that live sales took out of this row.
      const held = round3(
        (
          await tx.saleOrderItem.aggregate({
            where: { roasterInventoryId: id, saleOrder: { status: { not: 'Cancelled' } } },
            _sum: { quantity: true },
          })
        )._sum.quantity ?? 0
      )
      // Remaining must not exceed the claimed amount — either the new value
      // being set in this request, or the existing one on the row.
      const claimed = nextClaimed ?? fresh.claimedWeightKg
      const remaining = nextRemaining ?? fresh.remainingWeightKg
      if (held > WEIGHT_EPSILON) {
        if (claimed + WEIGHT_EPSILON < held) throw new ClaimedBelowHeldError(held)
        if (remaining + held > claimed + WEIGHT_EPSILON) {
          throw new HeldBySalesError(round3(claimed - held), held)
        }
      }
      if (remaining > claimed + WEIGHT_EPSILON) throw new ExceedsClaimedError()

      return tx.roasterInventoryItem.update({
        where: { id },
        data: updateData,
        include: {
          roaster: {
            select: {
              id: true,
              name: true,
            },
          },
          greenBeanLot: {
            include: {
              parchmentLot: {
                include: {
                  harvestLot: {
                    select: {
                      id: true,
                      farmerName: true,
                      cherryVariety: true,
                    },
                  },
                },
              },
            },
          },
          roastBatches: {
            orderBy: { roastDate: 'desc' },
          },
        },
      })
    }, SALE_TX_OPTIONS)

    if (!updatedItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ inventoryItem: updatedItem })
  } catch (error) {
    if (error instanceof ClaimedBelowHeldError || error instanceof HeldBySalesError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof ExceedsClaimedError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return handleApiError(error)
  }
}
