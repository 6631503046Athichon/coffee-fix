import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'
import { SALE_TX_OPTIONS, WEIGHT_EPSILON, formatKgText, round3 } from '@/lib/saleOrders'
import { batchLabel, canClaimGreenBeanLot, chainScope } from '@/lib/farmAccess'

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

// Why kg of this row are off its shelf: roasts used them, live sales hold them.
const usedReason = (roasted: number, held: number) =>
  roasted > WEIGHT_EPSILON && held > WEIGHT_EPSILON
    ? `${formatKgText(roasted)} kg of this lot were roasted and sales hold ${formatKgText(held)} kg`
    : roasted > WEIGHT_EPSILON
      ? `${formatKgText(roasted)} kg of this lot were roasted`
      : `sales hold ${formatKgText(held)} kg of this lot`

// Refusals raised inside the PUT's transaction, so they roll it back.
class ClaimedBelowUsedError extends Error {
  constructor(roasted: number, held: number) {
    super(
      roasted > WEIGHT_EPSILON
        ? `Claimed weight cannot be less than ${formatKgText(round3(roasted + held))} kg because ${usedReason(roasted, held)}.`
        : `Claimed weight cannot be less than the ${formatKgText(held)} kg that sales hold of this lot.`,
    )
    this.name = 'ClaimedBelowUsedError'
  }
}

class UsedStockError extends Error {
  constructor(cap: number, roasted: number, held: number) {
    super(`Remaining weight can be at most ${formatKgText(cap)} kg because ${usedReason(roasted, held)}.`)
    this.name = 'UsedStockError'
  }
}

class ExceedsClaimedError extends Error {
  constructor() {
    super('remainingWeightKg cannot exceed claimedWeightKg')
    this.name = 'ExceedsClaimedError'
  }
}

// Lowering the claim sends kg back to the lot; only kg still on this row's
// shelf can go.
class NotEnoughLeftError extends Error {
  constructor(left: number) {
    super(
      `Only ${formatKgText(left)} kg of this claim are still in stock, so at most that much can go back to the lot.`,
    )
    this.name = 'NotEnoughLeftError'
  }
}

// Lowering the claim with an explicit remaining: the returned kg have to come
// off the shelf, or kg the roaster wrote off would turn up in the lot.
class ReturnStaysOnShelfError extends Error {
  constructor(returned: number, cap: number) {
    super(
      `Lowering the claim sends ${formatKgText(returned)} kg back to the lot, so at most ${formatKgText(cap)} kg can stay in stock.`,
    )
    this.name = 'ReturnStaysOnShelfError'
  }
}

// A lot never holds more than it started with. Claims made before the claim
// route took kg off the lot (2025-11 to 2026-02) never lowered it, so giving
// such a claim back would otherwise put kg on the lot that were never there.
class LotOverfillError extends Error {
  constructor(initialKg: number, lotKg: number) {
    super(
      `The green bean lot started with ${formatKgText(initialKg)} kg and holds ${formatKgText(lotKg)} kg, so at most ${formatKgText(Math.max(0, round6(initialKg - lotKg)))} kg can go back to it.`,
    )
    this.name = 'LotOverfillError'
  }
}

class LotUnavailableError extends Error {
  constructor() {
    super('Green bean lot is not available')
    this.name = 'LotUnavailableError'
  }
}

class LotShortError extends Error {
  constructor(lotKg: number) {
    super(`The green bean lot has only ${formatKgText(Math.max(0, lotKg))} kg left to claim.`)
    this.name = 'LotShortError'
  }
}

// Claiming more of another user's bought-in lot, as POST /roaster-inventory
// refuses a claim on it.
class LotNotClaimableError extends Error {
  constructor() {
    super('This green bean lot was bought in by another user, so it cannot be claimed')
    this.name = 'LotNotClaimableError'
  }
}

class LotNotFoundError extends Error {
  constructor() {
    super('Green bean lot not found')
    this.name = 'LotNotFoundError'
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

    // The lot's processing batch comes as a label (process, variety, farm),
    // not the processor's record, unless the reader may read the batch
    // (lib/farmAccess chainScope).
    const parchmentLot = inventoryItem.greenBeanLot?.parchmentLot
    const batch = parchmentLot?.processingBatch
    if (parchmentLot && batch) {
      const scope = await chainScope(user)
      if (scope && !scope.canReadBatch(batch)) {
        return NextResponse.json({
          inventoryItem: {
            ...inventoryItem,
            greenBeanLot: {
              ...inventoryItem.greenBeanLot,
              parchmentLot: { ...parchmentLot, processingBatch: batchLabel(batch) },
            },
          },
        })
      }
    }

    return NextResponse.json({ inventoryItem })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/roaster-inventory/:id - Correct a stock row's claimed or remaining kg
// The claim is how many kg this row took off its source green-bean lot, so
// changing it moves the difference between the lot and the row in the same
// transaction: claiming more takes the kg off the lot (which must be Available
// and hold them), claiming less puts them back. When remainingWeightKg is not
// sent, the moved kg land on, or come off, this row's shelf; when it is sent
// with a lower claim, the returned kg must still come off the shelf.
// Returned kg never lift the lot above its initial weight, and never change
// its availability: a withdrawn lot stays withdrawn until its owner re-lists it.
// Roasts and green-bean sales that are not Cancelled already took their kg out
// of remainingWeightKg, so the row must keep room for them:
// claimed >= roasted + held and remaining + roasted + held <= claimed.
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
      select: { roasterId: true, greenBeanLotId: true },
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
    }

    // A stock row never changes lot, so the id read above is the one to lock.
    const lotId = inventoryItem.greenBeanLotId

    const result = await prisma.$transaction(async (tx) => {
      // Lot first, then the stock row: the order a claim and a withdrawal into
      // this row take them, so none of them can deadlock with this edit. The
      // lot is locked only when the claim may change.
      // NO KEY UPDATE, not UPDATE: it serialises with every stock write (sale
      // takes and returns, roasts, claims) but not with the KEY SHARE locks
      // that in-flight sale-line and roast inserts hold on these rows, which a
      // plain FOR UPDATE would wait behind.
      if (nextClaimed !== null) {
        await tx.$queryRaw`SELECT "id" FROM "GreenBeanLot" WHERE "id" = ${lotId} FOR NO KEY UPDATE`
      }
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
      // Kg that roasts took out of this row.
      const roasted = round3(
        (
          await tx.roastBatch.aggregate({
            where: { roasterInventoryId: id },
            _sum: { batchSizeKg: true },
          })
        )._sum.batchSizeKg ?? 0
      )
      const used = round3(held + roasted)

      // Kg the claim moves: > 0 come off the source lot, < 0 go back to it.
      const claimDelta = nextClaimed === null ? 0 : nextClaimed - fresh.claimedWeightKg
      const claimMoves = Math.abs(claimDelta) > WEIGHT_EPSILON
      const claimed = nextClaimed !== null && claimMoves ? nextClaimed : fresh.claimedWeightKg
      const remaining =
        nextRemaining ?? (claimMoves ? round6(fresh.remainingWeightKg + claimDelta) : fresh.remainingWeightKg)

      if (claimed + WEIGHT_EPSILON < used) throw new ClaimedBelowUsedError(roasted, held)
      if (remaining < -WEIGHT_EPSILON) throw new NotEnoughLeftError(fresh.remainingWeightKg)
      // Remaining must not exceed the claimed amount less what roasts and
      // sales already took — either the new claim or the existing one.
      if (used > WEIGHT_EPSILON && remaining + used > claimed + WEIGHT_EPSILON) {
        throw new UsedStockError(round3(claimed - used), roasted, held)
      }
      if (remaining > claimed + WEIGHT_EPSILON) throw new ExceedsClaimedError()
      // Kg going back to the lot leave the shelf: with them still in stock,
      // kg written off earlier would reappear in the owner's lot.
      if (claimMoves && claimDelta < 0) {
        const shelfAfterReturn = round6(fresh.remainingWeightKg + claimDelta)
        if (shelfAfterReturn < -WEIGHT_EPSILON) throw new NotEnoughLeftError(fresh.remainingWeightKg)
        if (remaining > shelfAfterReturn + WEIGHT_EPSILON) {
          throw new ReturnStaysOnShelfError(-claimDelta, shelfAfterReturn)
        }
      }

      let updatedSourceLot: { id: string; currentWeightKg: number; availabilityStatus: string } | null = null
      if (claimMoves) {
        const lot = await tx.greenBeanLot.findUnique({
          where: { id: lotId },
          select: {
            currentWeightKg: true,
            initialWeightKg: true,
            availabilityStatus: true,
            sourceType: true,
            createdById: true,
          },
        })
        if (!lot) throw new LotNotFoundError()

        let lotKg: number
        let availabilityStatus = lot.availabilityStatus
        if (claimDelta > 0) {
          // Claiming more is a claim: same rules as POST /roaster-inventory.
          if (!canClaimGreenBeanLot(user, lot)) throw new LotNotClaimableError()
          if (lot.availabilityStatus !== 'Available') throw new LotUnavailableError()
          if (lot.currentWeightKg + WEIGHT_EPSILON < claimDelta) throw new LotShortError(lot.currentWeightKg)
          lotKg = Math.max(0, round6(lot.currentWeightKg - claimDelta))
          if (lotKg <= WEIGHT_EPSILON) {
            lotKg = 0
            availabilityStatus = 'Withdrawn'
          }
        } else {
          lotKg = round6(lot.currentWeightKg - claimDelta)
          // Within the lot's initial weight (unless its owner already put it
          // above that). The status is left alone: a lot at 0 kg may have been
          // emptied by claims or withdrawn by its owner on purpose, and only
          // the owner should put it back on the market.
          if (
            lot.currentWeightKg <= lot.initialWeightKg + WEIGHT_EPSILON &&
            lotKg > lot.initialWeightKg + WEIGHT_EPSILON
          ) {
            throw new LotOverfillError(lot.initialWeightKg, lot.currentWeightKg)
          }
        }
        updatedSourceLot = await tx.greenBeanLot.update({
          where: { id: lotId },
          data: { currentWeightKg: lotKg, availabilityStatus },
          select: { id: true, currentWeightKg: true, availabilityStatus: true },
        })
      }

      const updateData: Prisma.RoasterInventoryItemUpdateInput = {}
      if (claimMoves) updateData.claimedWeightKg = claimed
      if (nextRemaining !== null || claimMoves) updateData.remainingWeightKg = Math.max(0, remaining)

      const updatedItem = await tx.roasterInventoryItem.update({
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
      return { inventoryItem: updatedItem, updatedSourceLot }
    }, SALE_TX_OPTIONS)

    if (!result) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      inventoryItem: result.inventoryItem,
      ...(result.updatedSourceLot && { updatedSourceLot: result.updatedSourceLot }),
    })
  } catch (error) {
    if (
      error instanceof ClaimedBelowUsedError ||
      error instanceof UsedStockError ||
      error instanceof NotEnoughLeftError ||
      error instanceof ReturnStaysOnShelfError ||
      error instanceof LotOverfillError ||
      error instanceof LotUnavailableError ||
      error instanceof LotShortError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof ExceedsClaimedError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof LotNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof LotNotClaimableError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return handleApiError(error)
  }
}
