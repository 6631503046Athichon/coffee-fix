import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/gap-logs/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const gapLog = await prisma.gAPLogEntry.findUnique({
      where: { id },
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
          },
        },
        activityType: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!gapLog) {
      return NextResponse.json(
        { error: 'GAP log not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ gapLog })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/gap-logs/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Farmer and Admin can edit GAP logs.
    requireRole(user, ['Farmer', 'Admin'])
    const { id } = await params

    // SECURITY: Ownership — only the Farmer who created the entry (or the
    // farm owner, or Admin) can update it. Legacy rows may have a null
    // createdBy, in which case only Admin can edit.
    const existingGapLog = await prisma.gAPLogEntry.findUnique({
      where: { id },
      select: {
        createdBy: true,
        farm: { select: { ownerId: true } },
      },
    })
    if (!existingGapLog) {
      return NextResponse.json(
        { error: 'GAP log not found' },
        { status: 404 }
      )
    }
    const isCreator = existingGapLog.createdBy === user.id
    const isFarmOwner = existingGapLog.farm?.ownerId === user.id
    if (!user.roles.includes('Admin') && !user.isSuperAdmin && !isCreator && !isFarmOwner) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { farmId, farmPlotLocation, activityTypeId, date, productUsed, quantity, notes } = body

    // Use UncheckedUpdateInput so we can assign scalar FKs (farmId, activityTypeId)
    // directly without needing a nested `connect`.
    const updateData: Prisma.GAPLogEntryUncheckedUpdateInput = {}
    if (farmId !== undefined) updateData.farmId = farmId
    if (farmPlotLocation !== undefined) updateData.farmPlotLocation = farmPlotLocation
    if (activityTypeId !== undefined) {
      updateData.activityTypeId = activityTypeId
      // Update activity type name
      const activityType = await prisma.activityType.findUnique({
        where: { id: activityTypeId },
      })
      if (activityType) {
        updateData.activityTypeName = activityType.name
      }
    }
    if (date !== undefined) updateData.date = new Date(date)
    if (productUsed !== undefined) updateData.productUsed = productUsed
    if (quantity !== undefined) updateData.quantity = quantity
    if (notes !== undefined) updateData.notes = notes

    const updatedGapLog = await prisma.gAPLogEntry.update({
      where: { id },
      data: updateData,
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
          },
        },
        activityType: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ gapLog: updatedGapLog })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/gap-logs/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Farmer and Admin can delete GAP logs.
    requireRole(user, ['Farmer', 'Admin'])
    const { id } = await params

    // SECURITY: Ownership — same rule as PUT.
    const existingGapLog = await prisma.gAPLogEntry.findUnique({
      where: { id },
      select: {
        createdBy: true,
        farm: { select: { ownerId: true } },
      },
    })
    if (!existingGapLog) {
      return NextResponse.json(
        { error: 'GAP log not found' },
        { status: 404 }
      )
    }
    const isCreator = existingGapLog.createdBy === user.id
    const isFarmOwner = existingGapLog.farm?.ownerId === user.id
    if (!user.roles.includes('Admin') && !user.isSuperAdmin && !isCreator && !isFarmOwner) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    await prisma.gAPLogEntry.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'GAP log deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
