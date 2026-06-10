import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'

// GET /api/roaster-inventory/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
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

    return NextResponse.json({ inventoryItem })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/roaster-inventory/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const inventoryItem = await prisma.roasterInventoryItem.findUnique({
      where: { id },
    })

    if (!inventoryItem) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      )
    }

    // Check permission
    if (inventoryItem.roasterId !== user.id && !user.roles.includes('Admin')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

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

    if (remainingWeightKg !== undefined) {
      const parsed = safeParseFloat(remainingWeightKg)
      if (parsed === null || !Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'Invalid remainingWeightKg' },
          { status: 400 }
        )
      }
      // Remaining must not exceed the claimed amount — either the new value
      // being set in this request, or the existing one on the row.
      const cap = nextClaimed ?? inventoryItem.claimedWeightKg
      if (typeof cap === 'number' && parsed > cap) {
        return NextResponse.json(
          { error: 'remainingWeightKg cannot exceed claimedWeightKg' },
          { status: 400 }
        )
      }
      updateData.remainingWeightKg = parsed
    }

    const updatedItem = await prisma.roasterInventoryItem.update({
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

    return NextResponse.json({ inventoryItem: updatedItem })
  } catch (error) {
    return handleApiError(error)
  }
}
