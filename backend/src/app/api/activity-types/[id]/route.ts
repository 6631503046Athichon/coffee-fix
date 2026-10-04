import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/activity-types/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const activityType = await prisma.activityType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            gapLogs: true,
          },
        },
      },
    })

    if (!activityType) {
      return NextResponse.json(
        { error: 'Activity type not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ activityType })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/activity-types/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const body = await request.json()
    const { name, description, isActive } = body

    const updateData: Prisma.ActivityTypeUpdateInput = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive

    // GAP logs keep a copy of their type's name (activityTypeName), which the
    // GAP pages show, filter on and look the type up by when a log is edited.
    // A rename moves every log of this type to the new name in the same
    // transaction; a stale copy would drop the older logs out of the filters
    // and make editing them fail with "not found".
    const updatedActivityType = await prisma.$transaction(async (tx) => {
      const activityType = await tx.activityType.update({
        where: { id },
        data: updateData,
      })
      if (name !== undefined) {
        await tx.gAPLogEntry.updateMany({
          where: { activityTypeId: id, activityTypeName: { not: activityType.name } },
          data: { activityTypeName: activityType.name },
        })
      }
      return activityType
    })

    return NextResponse.json({ activityType: updatedActivityType })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/activity-types/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    // Check if used in any GAP logs
    const gapLogsCount = await prisma.gAPLogEntry.count({
      where: { activityTypeId: id },
    })

    if (gapLogsCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete activity type that is used in GAP logs. Deactivate it instead.' },
        { status: 400 }
      )
    }

    await prisma.activityType.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Activity type deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
