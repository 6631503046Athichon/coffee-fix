import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/roaster-inventory - List all roaster inventory items
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.RoasterInventoryItemWhereInput = {}

    // Filter by roasterId if provided
    const roasterId = request.nextUrl.searchParams.get('roasterId')
    if (roasterId) {
      where.roasterId = roasterId
    } else if (user.roles.includes('Roaster') && !user.roles.includes('Admin')) {
      // Roasters see only their own inventory
      where.roasterId = user.id
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

    return NextResponse.json({ inventoryItems })
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
    if (lot.availabilityStatus !== 'Available')
      return NextResponse.json({ error: 'Green bean lot is not available' }, { status: 400 })

    const weight = parseFloat(claimedWeightKg)

    if (!Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ error: 'Invalid claimed weight' }, { status: 400 })
    }

    if (weight > lot.currentWeightKg) {
      return NextResponse.json({ error: 'Insufficient weight available' }, { status: 400 })
    }

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
        where: { id: greenBeanLotId, currentWeightKg: { gte: weight } },
        data: { currentWeightKg: { decrement: weight } },
      })
      if (decResult.count === 0) {
        throw new Error('INSUFFICIENT_STOCK')
      }

      // Re-read post-decrement weight to decide availabilityStatus. Only flip
      // to Withdrawn when stock is depleted — never clobber an existing
      // Withdrawn status back to Available.
      const fresh = await tx.greenBeanLot.findUnique({
        where: { id: greenBeanLotId },
        select: { currentWeightKg: true, availabilityStatus: true },
      })
      const remaining = fresh?.currentWeightKg ?? 0
      const updatedSourceLot = await tx.greenBeanLot.update({
        where: { id: greenBeanLotId },
        data: {
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
            roasterId: user.id,
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
      } else {
        inventoryItem = await tx.roasterInventoryItem.create({
          data: {
            roasterId: user.id,
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
        inventoryItem: claimResult.inventoryItem,
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
