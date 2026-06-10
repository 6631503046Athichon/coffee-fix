import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/roast-batches - List all roast batches
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.RoastBatchWhereInput = {}
    
    // Filter by roasterId if provided
    const roasterId = request.nextUrl.searchParams.get('roasterId')
    if (roasterId) {
      where.roasterId = roasterId
    } else if (user.roles.includes('Roaster') && !user.roles.includes('Admin')) {
      // Roasters see only their own batches
      where.roasterId = user.id
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
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const body = await request.json()
    const { roasterInventoryId, greenBeanLotId, batchSizeKg, yieldPercentage, roastedWeightKg, weightLossPct, roastLevel, roastProfileNotes, flavorNotes } = body

    // Validation
    if (!roasterInventoryId || !greenBeanLotId || !batchSizeKg || !yieldPercentage || !roastProfileNotes) {
      return NextResponse.json(
        { error: 'Roaster inventory ID, green bean lot ID, batch size, yield percentage, and roast profile notes are required' },
        { status: 400 }
      )
    }

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

    if (inventory.roasterId !== user.id && !user.roles.includes('Admin')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const amount = parseFloat(batchSizeKg)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid batch size' },
        { status: 400 }
      )
    }

    if (amount > inventory.remainingWeightKg) {
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
          where: { id: roasterInventoryId, remainingWeightKg: { gte: amount } },
          data: { remainingWeightKg: { decrement: amount } },
        })
        if (decResult.count === 0) {
          throw new Error('INSUFFICIENT_INVENTORY')
        }

        // Create roast batch
        const batch = await tx.roastBatch.create({
          data: {
            roasterId: user.id,
            roasterInventoryId,
            greenBeanLotId,
            batchSizeKg: amount,
            yieldPercentage: parseFloat(yieldPercentage),
            roastedWeightKg: roastedWeightKg ? parseFloat(roastedWeightKg) : null,
            weightLossPct: weightLossPct ? parseFloat(weightLossPct) : null,
            roastLevel: roastLevel || null,
            roastProfileNotes,
            flavorNotes: flavorNotes || null,
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

