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
      select: {
        id: true,
        inventoryId: true,
        roasterId: true,
        greenBeanLotId: true,
        claimedWeightKg: true,
        remainingWeightKg: true,
        createdAt: true,
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
      orderBy: { createdAt: 'asc' },
    })

    console.log('[RoasterInventory API] Returning items:', inventoryItems.map(item => ({ id: item.id, inventoryId: item.inventoryId, greenBeanLotId: item.greenBeanLotId })));
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

    console.log('[POST roaster-inventory] user:', user.id, 'roles:', user.roles, 'body:', JSON.stringify(body));

    // Validation
    if (!greenBeanLotId || !claimedWeightKg) {
      console.log('[POST roaster-inventory] VALIDATION FAIL: greenBeanLotId=', greenBeanLotId, 'claimedWeightKg=', claimedWeightKg);
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

    const weight = parseFloat(claimedWeightKg);

    // Generate next inventoryId BEFORE the transaction to keep transaction fast
    const allItems = await prisma.roasterInventoryItem.findMany({
      select: { inventoryId: true },
      where: { inventoryId: { not: null } }
    });
    
    let maxNumber = 0;
    allItems.forEach(item => {
      if (item.inventoryId) {
        const match = item.inventoryId.match(/INV-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    });

    // Try up to 3 sequential IDs in case of collision
    let inventoryItem;
    let created = false;
    
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const inventoryId = `INV-${String(maxNumber + 1 + attempt).padStart(3, '0')}`;
      
      try {
        inventoryItem = await prisma.$transaction(async (tx) => {
          // Deduct weight from green bean lot
          const currentLot = await tx.greenBeanLot.findUnique({ where: { id: greenBeanLotId } });
          if (!currentLot || currentLot.currentWeightKg < weight) {
            throw new Error('Insufficient weight available');
          }

          await tx.greenBeanLot.update({
            where: { id: greenBeanLotId },
            data: {
              currentWeightKg: currentLot.currentWeightKg - weight,
              availabilityStatus: (currentLot.currentWeightKg - weight) <= 0 ? 'Withdrawn' : 'Available',
            },
          });

          // Create new inventory row
          return tx.roasterInventoryItem.create({
            data: {
              inventoryId,
              roasterId: user.id,
              greenBeanLotId,
              claimedWeightKg: weight,
              remainingWeightKg: weight,
            },
          });
        }, { timeout: 15000 });
        created = true;
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < 2) {
          continue; // Retry with next ID
        }
        throw err;
      }
    }

    // Fetch full item with relations separately (outside transaction)
    const fullItem = await prisma.roasterInventoryItem.findUnique({
      where: { id: inventoryItem!.id },
      include: {
        roaster: { select: { id: true, name: true } },
        greenBeanLot: {
          include: {
            parchmentLot: {
              include: {
                harvestLot: { select: { id: true, farmerName: true, cherryVariety: true } }
              }
            },
            priceSetter: { select: { id: true, name: true } },
          },
        },
        roastBatches: { orderBy: { roastDate: 'desc' }, take: 5 },
      },
    });

    return NextResponse.json(
      { inventoryItem: fullItem, message: 'Green bean lot claimed successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

