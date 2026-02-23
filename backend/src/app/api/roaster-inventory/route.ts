import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/roaster-inventory - List all roaster inventory items
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: any = {}
    
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
      return NextResponse.json({ error: 'Green bean lot ID and claimed weight are required' }, { status: 400 })
    }

    const lot = await prisma.greenBeanLot.findUnique({ where: { id: greenBeanLotId } })

    if (!lot) return NextResponse.json({ error: 'Green bean lot not found' }, { status: 404 })
    if (lot.availabilityStatus !== 'Available') return NextResponse.json({ error: 'Green bean lot is not available' }, { status: 400 })

    const weight = parseFloat(claimedWeightKg)

    if (weight > lot.currentWeightKg) {
      return NextResponse.json({ error: 'Insufficient weight available' }, { status: 400 })
    }

    const newLotWeight = lot.currentWeightKg - weight

    const inventoryItem = await prisma.$transaction(async (tx) => {
      // Deduct from the source lot; mark Sold when fully claimed
      await tx.greenBeanLot.update({
        where: { id: greenBeanLotId },
        data: {
          currentWeightKg: newLotWeight,
          availabilityStatus: newLotWeight <= 0 ? 'Sold' : 'Available',
        },
      })

      return tx.roasterInventoryItem.upsert({
        where: { roasterId_greenBeanLotId: { roasterId: user.id, greenBeanLotId } },
        update: {
          claimedWeightKg: { increment: weight },
          remainingWeightKg: { increment: weight },
        },
        create: {
          roasterId: user.id,
          greenBeanLotId,
          claimedWeightKg: weight,
          remainingWeightKg: weight,
        },
        include: {
          roaster: { select: { id: true, name: true } },
          greenBeanLot: {
            include: {
              parchmentLot: {
                include: {
                  harvestLot: { select: { id: true, farmerName: true, cherryVariety: true } },
                },
              },
            },
          },
        },
      })
    })

    return NextResponse.json({ inventoryItem, message: 'Green bean lot claimed successfully' }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

