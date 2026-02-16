import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'

// PATCH /api/parchment-lots/:id - Update parchment lot
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can update parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params
    const body = await request.json()

    const { status, currentWeightKg } = body

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (currentWeightKg !== undefined) {
      const weight = safeParseFloat(currentWeightKg)
      if (weight !== null) updateData.currentWeightKg = weight
    }

    const parchmentLot = await prisma.parchmentLot.update({
      where: { id },
      data: updateData,
      include: {
        processingBatch: {
          include: {
            harvestLot: true,
          },
        },
      },
    })

    return NextResponse.json({ parchmentLot, message: 'Parchment lot updated successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/parchment-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const parchmentLot = await prisma.parchmentLot.findUnique({
      where: { id },
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
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
          },
        },
        physicalTestResults: true,
        greenBeanLots: true,
      },
    })

    if (!parchmentLot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ parchmentLot })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/parchment-lots/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can delete parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // Check if lot exists
    const lot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        greenBeanLots: true,
      },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    // Check if there are green bean lots linked
    if (lot.greenBeanLots && lot.greenBeanLots.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete parchment lot with linked green bean lots. Delete green bean lots first.' },
        { status: 400 }
      )
    }

    // Delete physical test results first
    await prisma.physicalTestResults.deleteMany({
      where: { parchmentLotId: id },
    })

    // Delete the lot
    await prisma.parchmentLot.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Parchment lot deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
