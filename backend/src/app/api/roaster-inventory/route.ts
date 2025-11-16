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

    // Validation
    if (!greenBeanLotId || !claimedWeightKg) {
      return NextResponse.json(
        { error: 'Green bean lot ID and claimed weight are required' },
        { status: 400 }
      )
    }

    // Get green bean lot
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id: greenBeanLotId },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    if (lot.availabilityStatus !== 'Available') {
      return NextResponse.json(
        { error: 'Green bean lot is not available' },
        { status: 400 }
      )
    }

    if (parseFloat(claimedWeightKg) > lot.currentWeightKg) {
      return NextResponse.json(
        { error: 'Insufficient weight available' },
        { status: 400 }
      )
    }

    // Check if already claimed
    const existing = await prisma.roasterInventoryItem.findUnique({
      where: {
        roasterId_greenBeanLotId: {
          roasterId: user.id,
          greenBeanLotId,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Already claimed. Update existing inventory item instead.' },
        { status: 409 }
      )
    }

    const inventoryItem = await prisma.roasterInventoryItem.create({
      data: {
        roasterId: user.id,
        greenBeanLotId,
        claimedWeightKg: parseFloat(claimedWeightKg),
        remainingWeightKg: parseFloat(claimedWeightKg),
      },
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
      },
    })

    return NextResponse.json(
      { inventoryItem, message: 'Green bean lot claimed successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

