import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError, type AuthenticatedUser } from '@/lib/middleware'
import {
  canUseFarm,
  farmMemberSelect,
  isFarmMember,
  requireFarmAccess,
  type FarmMembers,
} from '@/lib/farmAccess'
import { isAdminUser } from '@/lib/saleOrders'

type LogAccess = { createdBy: string | null; farm: FarmMembers | null }

/**
 * Who may read and edit a log: Admins and the farm's current owner and
 * collaborators. Whoever recorded it counts only for a legacy log with no
 * farm: a farmhand the owner removed, or the owner before an Admin
 * transferred the farm, keeps no access through the logs they wrote.
 */
function canUseLog(user: AuthenticatedUser, log: LogAccess): boolean {
  if (log.farm) return canUseFarm(user, log.farm)
  return isAdminUser(user) || (!!log.createdBy && log.createdBy === user.id)
}

/**
 * Who may take a log out of its farm's GAP trail, by deleting it or moving it
 * to another farm: Admins, the farm's owner, and whoever recorded it while
 * they are still a member of the farm. Other collaborators may edit it, not
 * remove it.
 */
function canRemoveLog(user: AuthenticatedUser, log: LogAccess): boolean {
  if (isAdminUser(user)) return true
  const isCreator = !!log.createdBy && log.createdBy === user.id
  if (!log.farm) return isCreator
  return log.farm.ownerId === user.id || (isCreator && isFarmMember(user, log.farm))
}

// GET /api/gap-logs/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    // SECURITY: the same people who may edit it (canUseLog).
    const access = await prisma.gAPLogEntry.findUnique({
      where: { id },
      select: {
        createdBy: true,
        farm: { select: farmMemberSelect(user.id) },
      },
    })
    if (!access) {
      return NextResponse.json(
        { error: 'GAP log not found' },
        { status: 404 }
      )
    }
    if (!canUseLog(user, access)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

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

    // SECURITY: Ownership — the farm's owner or collaborators, or Admin
    // (canUseLog). A legacy row with no farm: whoever created it, or Admin.
    const existingGapLog = await prisma.gAPLogEntry.findUnique({
      where: { id },
      select: {
        farmId: true,
        createdBy: true,
        farm: { select: farmMemberSelect(user.id) },
      },
    })
    if (!existingGapLog) {
      return NextResponse.json(
        { error: 'GAP log not found' },
        { status: 404 }
      )
    }
    if (!canUseLog(user, existingGapLog)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { farmId, farmPlotLocation, activityTypeId, date, productUsed, quantity, notes } = body

    // SECURITY: a log moves only onto a farm the caller may record on (as
    // POST checks), so nobody can plant entries in another farmer's GAP
    // trail, and only off its farm for someone who may delete it there
    // (canRemoveLog), so a collaborator cannot pull the owner's entries out of
    // the trail. Only an Admin may leave a log with no farm at all.
    if (farmId !== undefined && farmId !== null && typeof farmId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid farmId' },
        { status: 400 }
      )
    }
    const targetFarmId: string | null | undefined = farmId === undefined ? undefined : (farmId || null)
    if (targetFarmId !== undefined && targetFarmId !== existingGapLog.farmId) {
      if (existingGapLog.farm && !canRemoveLog(user, existingGapLog)) {
        return NextResponse.json(
          { error: "Only the farm's owner, an Admin or whoever recorded the log can move it off its farm" },
          { status: 403 }
        )
      }
      if (targetFarmId === null) {
        if (!isAdminUser(user)) {
          return NextResponse.json(
            { error: 'Only an Admin can remove a GAP log from its farm' },
            { status: 403 }
          )
        }
      } else {
        const targetFarm = await prisma.farm.findUnique({
          where: { id: targetFarmId },
          select: farmMemberSelect(user.id),
        })
        if (!targetFarm) {
          return NextResponse.json(
            { error: 'Farm not found' },
            { status: 404 }
          )
        }
        requireFarmAccess(user, targetFarm)
      }
    }

    // Use UncheckedUpdateInput so we can assign scalar FKs (farmId, activityTypeId)
    // directly without needing a nested `connect`.
    const updateData: Prisma.GAPLogEntryUncheckedUpdateInput = {}
    if (targetFarmId !== undefined) updateData.farmId = targetFarmId
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

    // SECURITY: Admins, the farm's owner, or whoever recorded it while still
    // a member of the farm (canRemoveLog).
    const existingGapLog = await prisma.gAPLogEntry.findUnique({
      where: { id },
      select: {
        createdBy: true,
        farm: { select: farmMemberSelect(user.id) },
      },
    })
    if (!existingGapLog) {
      return NextResponse.json(
        { error: 'GAP log not found' },
        { status: 404 }
      )
    }
    if (!canRemoveLog(user, existingGapLog)) {
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
