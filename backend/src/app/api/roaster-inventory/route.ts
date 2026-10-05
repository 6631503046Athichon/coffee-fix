import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError, type AuthenticatedUser } from '@/lib/middleware'
import { WEIGHT_EPSILON, isAdminUser } from '@/lib/saleOrders'
import { canClaimGreenBeanLot } from '@/lib/farmAccess'
import { stockRowWithoutImporterFor } from '@/lib/importerPrivacy'

const NOT_CLAIMABLE_ERROR = 'This green bean lot was bought in by another user, so it cannot be claimed'

/** Kilograms to the milligram, as the sale and withdrawal routes store stock. */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * Whose stock row a claim fills. A purchased (External) lot is its buyer's:
 * when an Admin claims another user's purchased lot (Start roast or Sell on
 * the Roaster Workbench), the kg go into the buyer's stock row, so the roast
 * logged from that row is the buyer's too (POST /api/roast-batches records a
 * roast for its stock row's owner) and the buyer sees both. Every other claim
 * fills the caller's own stock.
 */
const claimStockOwnerId = (
  user: AuthenticatedUser,
  lot: { sourceType: string; createdById: string | null },
): string =>
  lot.sourceType === 'External' &&
  lot.createdById &&
  lot.createdById !== user.id &&
  isAdminUser(user)
    ? lot.createdById
    : user.id

// GET /api/roaster-inventory - List roaster inventory items
// Roasters see only their own inventory (?roasterId is ignored for them);
// Admins see every roaster's and may filter by ?roasterId.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const where: Prisma.RoasterInventoryItemWhereInput = {}

    const roasterId = request.nextUrl.searchParams.get('roasterId')
    if (!isAdminUser(user)) {
      where.roasterId = user.id
    } else if (roasterId) {
      where.roasterId = roasterId
    }

    const inventoryItems = await prisma.roasterInventoryItem.findMany({
      where,
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
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // The parchment's importer only for Admin and the importer (lib/importerPrivacy).
    return NextResponse.json({
      inventoryItems: inventoryItems.map(item => stockRowWithoutImporterFor(user, item)),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/roaster-inventory - Claim green bean lot for roasting
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const body = await request.json()
    const { greenBeanLotId, claimedWeightKg } = body

    if (!greenBeanLotId || !claimedWeightKg) {
      return NextResponse.json(
        { error: 'Green bean lot ID and claimed weight are required' },
        { status: 400 },
      )
    }

    const lot = await prisma.greenBeanLot.findUnique({ where: { id: greenBeanLotId } })

    if (!lot) return NextResponse.json({ error: 'Green bean lot not found' }, { status: 404 })
    // Another user's bought-in lot is theirs alone: it is not on the shelf
    // and cannot be claimed (lib/farmAccess).
    if (!canClaimGreenBeanLot(user, lot))
      return NextResponse.json({ error: NOT_CLAIMABLE_ERROR }, { status: 403 })
    if (lot.availabilityStatus !== 'Available')
      return NextResponse.json({ error: 'Green bean lot is not available' }, { status: 400 })

    // Kg to the milligram, as the lot's other stock routes store them.
    const weight = round6(parseFloat(claimedWeightKg))

    if (!Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ error: 'Invalid claimed weight' }, { status: 400 })
    }

    // Lot weights carry float leftovers (5 - 4 x 1.2 is 0.19999...), so the
    // checks allow WEIGHT_EPSILON of slack, or the last 0.2 kg could never be
    // claimed.
    if (weight > lot.currentWeightKg + WEIGHT_EPSILON) {
      return NextResponse.json({ error: 'Insufficient weight available' }, { status: 400 })
    }

    // An Admin's claim of a roaster's purchased lot is that roaster's stock.
    const ownerId = claimStockOwnerId(user, lot)

    const inventoryInclude = {
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
    } as const

    const claimResult = await prisma.$transaction(async (tx) => {
      // Atomic guarded decrement: two concurrent claims cannot both pass the
      // up-front weight check and overdraw the lot. updateMany compiles to
      // a single SQL UPDATE that Postgres serialises at the row level.
      const decResult = await tx.greenBeanLot.updateMany({
        where: { id: greenBeanLotId, currentWeightKg: { gte: weight - WEIGHT_EPSILON } },
        data: { currentWeightKg: { decrement: weight } },
      })
      if (decResult.count === 0) {
        throw new Error('INSUFFICIENT_STOCK')
      }

      // Re-read post-decrement weight to decide availabilityStatus. Only flip
      // to Withdrawn when stock is depleted — never clobber an existing
      // Withdrawn status back to Available. What is left is stored rounded
      // to the milligram and never below 0, so no float leftover stays.
      const fresh = await tx.greenBeanLot.findUnique({
        where: { id: greenBeanLotId },
        select: { currentWeightKg: true, availabilityStatus: true },
      })
      const remaining = Math.max(0, round6(fresh?.currentWeightKg ?? 0))
      const updatedSourceLot = await tx.greenBeanLot.update({
        where: { id: greenBeanLotId },
        data: {
          ...(fresh && remaining !== fresh.currentWeightKg && { currentWeightKg: remaining }),
          ...(remaining <= 0 && { availabilityStatus: 'Withdrawn' }),
        },
        select: {
          id: true,
          currentWeightKg: true,
          availabilityStatus: true,
        },
      })

      let inventoryItem
      // RoasterInventoryItem has `@@unique([roasterId, greenBeanLotId])`, so
      // there is at most one row per (roaster, greenBeanLot) pair. Use
      // findUnique on the composite key — it's a direct index hit and removes
      // the misleading "orderBy createdAt desc" that suggested duplicates
      // could exist.
      const existingItem = await tx.roasterInventoryItem.findUnique({
        where: {
          roasterId_greenBeanLotId: {
            roasterId: ownerId,
            greenBeanLotId,
          },
        },
        select: { id: true },
      })

      if (existingItem) {
        inventoryItem = await tx.roasterInventoryItem.update({
          where: { id: existingItem.id },
          data: {
            claimedWeightKg: { increment: weight },
            remainingWeightKg: { increment: weight },
          },
          include: inventoryInclude,
        })
        // Sums leave float leftovers too (0.7 + 0.1 is 0.7999...): store
        // them rounded to the milligram. The UPDATE above holds the row lock.
        const claimedKg = round6(inventoryItem.claimedWeightKg)
        const remainingKg = Math.max(0, round6(inventoryItem.remainingWeightKg))
        if (
          claimedKg !== inventoryItem.claimedWeightKg ||
          remainingKg !== inventoryItem.remainingWeightKg
        ) {
          inventoryItem = await tx.roasterInventoryItem.update({
            where: { id: existingItem.id },
            data: { claimedWeightKg: claimedKg, remainingWeightKg: remainingKg },
            include: inventoryInclude,
          })
        }
      } else {
        inventoryItem = await tx.roasterInventoryItem.create({
          data: {
            roasterId: ownerId,
            greenBeanLotId,
            claimedWeightKg: weight,
            remainingWeightKg: weight,
          },
          include: inventoryInclude,
        })
      }

      return {
        inventoryItem,
        updatedSourceLot,
      }
    })

    return NextResponse.json(
      {
        inventoryItem: stockRowWithoutImporterFor(user, claimResult.inventoryItem),
        updatedSourceLot: claimResult.updatedSourceLot,
        message: 'Green bean lot claimed successfully',
      },
      { status: 201 },
    )
  } catch (error) {
    if ((error as Error)?.message === 'INSUFFICIENT_STOCK') {
      return NextResponse.json(
        { error: 'Insufficient weight available' },
        { status: 400 },
      )
    }
    return handleApiError(error)
  }
}
