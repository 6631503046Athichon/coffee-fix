import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { isAdminUser } from '@/lib/saleOrders'

// GET /api/farms/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const farm = await prisma.farm.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, roles: true } },
          },
        },
        harvestLots: {
          take: 10,
          orderBy: { harvestDate: 'desc' },
        },
      },
    })

    if (!farm) {
      return NextResponse.json(
        { error: 'Farm not found' },
        { status: 404 }
      )
    }

    // Check permission: owner, collaborator, or admin
    const isCollaborator = farm.collaborators.some((c: { userId: string }) => c.userId === user.id)
    if (!isAdminUser(user) && farm.ownerId !== user.id && !isCollaborator) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json({ farm })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/farms/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const farm = await prisma.farm.findUnique({
      where: { id },
    })

    if (!farm) {
      return NextResponse.json(
        { error: 'Farm not found' },
        { status: 404 }
      )
    }

    // Check permission: owner or admin can edit (collaborators cannot change farm settings)
    if (!isAdminUser(user) && farm.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { farmName, location, latitude, longitude, altitude, sizeHectares, varieties, caretakerName, caretakerNames, archived, googleMapsUrl, ownerNames, ownerId, weatherAutoFetchEnabled, weatherAutoFetchInterval } = body

    // Use UncheckedUpdateInput so we can assign scalar FKs (ownerId) directly
    // without needing a nested `connect` — see Prisma generated types.
    const updateData: Prisma.FarmUncheckedUpdateInput = {}
    if (farmName !== undefined) updateData.farmName = farmName
    if (location !== undefined) updateData.location = location
    if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(latitude) : null
    if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(longitude) : null
    if (altitude !== undefined) updateData.altitude = altitude
    if (sizeHectares !== undefined) updateData.sizeHectares = sizeHectares ? parseFloat(sizeHectares) : null
    if (varieties !== undefined) updateData.varieties = varieties
    // Compute the normalized caretakerNames array locally so we can read its
    // length without fighting Prisma's union type on the scalar-list field
    // (string[] | FarmUpdatecaretakerNamesInput).
    let normalizedCaretakerNames: string[] | undefined
    if (caretakerNames !== undefined || caretakerName !== undefined) {
      normalizedCaretakerNames = Array.isArray(caretakerNames)
        ? caretakerNames.map((name: unknown) => String(name).trim()).filter(Boolean)
        : (typeof caretakerName === 'string'
            ? caretakerName.split(',').map((name: string) => name.trim()).filter(Boolean)
            : [])
      updateData.caretakerNames = normalizedCaretakerNames
    }
    if (caretakerName !== undefined) updateData.caretakerName = caretakerName || null
    if (caretakerNames !== undefined && normalizedCaretakerNames && normalizedCaretakerNames.length > 0) {
      updateData.caretakerName = null
    }
    if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl || null
    if (ownerNames !== undefined) {
      updateData.ownerNames = Array.isArray(ownerNames)
        ? ownerNames.map((name: unknown) => String(name).trim()).filter(Boolean)
        : []
    }
    if (archived !== undefined) {
      updateData.archived = archived
      updateData.archivedAt = archived ? new Date() : null
    }

    // Owner reassignment - Admin only
    const ownerChanges = ownerId !== undefined && ownerId !== farm.ownerId
    if (ownerChanges) {
      if (!isAdminUser(user)) {
        return NextResponse.json(
          { error: 'Only admin can change farm ownership' },
          { status: 403 }
        )
      }
      updateData.ownerId = ownerId
    }

    // Weather auto-fetch settings - Admin only
    if (weatherAutoFetchEnabled !== undefined || weatherAutoFetchInterval !== undefined) {
      if (!isAdminUser(user)) {
        return NextResponse.json(
          { error: 'Only admin can change weather auto-fetch settings' },
          { status: 403 }
        )
      }
      if (weatherAutoFetchEnabled !== undefined) updateData.weatherAutoFetchEnabled = Boolean(weatherAutoFetchEnabled)
      if (weatherAutoFetchInterval !== undefined) {
        const interval = parseInt(weatherAutoFetchInterval)
        if (!isNaN(interval) && interval >= 1) updateData.weatherAutoFetchInterval = interval
      }
    }

    const farmUpdate = prisma.farm.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, roles: true } },
          },
        },
      },
    })

    // A lot on a farm belongs to the farm's owner, and harvest-lots reads that
    // owner from HarvestLot.createdById first. So the farm's lots change hands
    // with it, in the same transaction, or the old owner would keep editing
    // them while the new owner sees them but gets 403.
    const updatedFarm = ownerChanges
      ? (await prisma.$transaction([
          farmUpdate,
          prisma.harvestLot.updateMany({
            where: { farmId: id },
            data: { createdById: ownerId },
          }),
        ]))[0]
      : await farmUpdate

    return NextResponse.json({ farm: updatedFarm })
  } catch (error) {
    return handleApiError(error)
  }
}

const FARM_HAS_RECORDS_ERROR =
  'This farm still has records linked to it. Delete or move them first, then delete the farm.'

// What keeps a farm from being deleted: deleting it would clear the farm from
// its harvest lots and GAP logs (they would drop out of the owner's views)
// and delete its soil analyses with it. Its weather records, fetched or typed
// in, are deleted with the farm. This applies to Admins too.
type FarmTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function countFarmRecords(db: FarmTx, farmId: string) {
  const harvestLots = await db.harvestLot.count({ where: { farmId } })
  const gapLogs = await db.gAPLogEntry.count({ where: { farmId } })
  const soilAnalyses = await db.soilAnalysis.count({ where: { farmId } })
  return { harvestLots, gapLogs, soilAnalyses }
}

// DELETE /api/farms/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const farm = await prisma.farm.findUnique({
      where: { id },
    })

    if (!farm) {
      return NextResponse.json(
        { error: 'Farm not found' },
        { status: 404 }
      )
    }

    // Check permission: Admin หรือ owner ของ farm เท่านั้น
    if (!isAdminUser(user) && farm.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Count and delete in one transaction that first locks the farm row. A
    // lot, GAP log or soil analysis being linked to the farm holds a key-share
    // lock on that row until it commits, so the lock waits for it and the
    // counts below see it; one linked after the lock waits for the delete and
    // then fails on the missing farm. Without the lock, a record committed
    // between the count and the delete would lose its farm.
    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Farm" WHERE "id" = ${id} FOR UPDATE`
      if (locked.length === 0) return { status: 'missing' as const }

      const dependents = await countFarmRecords(tx, id)
      if (Object.values(dependents).some(count => count > 0)) {
        return { status: 'linked' as const, dependents }
      }

      // The weather goes first in case the database lacks the cascade.
      await tx.weatherRecord.deleteMany({ where: { farmId: id } })
      await tx.farm.delete({ where: { id } })
      return { status: 'deleted' as const }
    })

    if (outcome.status === 'missing') {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }
    if (outcome.status === 'linked') {
      return NextResponse.json(
        { error: FARM_HAS_RECORDS_ERROR, dependents: outcome.dependents },
        { status: 409 }
      )
    }

    return NextResponse.json({ message: 'Farm deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
