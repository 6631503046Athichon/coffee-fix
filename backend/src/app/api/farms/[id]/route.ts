import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

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

    // Check permission
    if (!user.roles.includes('Admin') && farm.ownerId !== user.id) {
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

    // Check permission
    if (!user.roles.includes('Admin') && farm.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { farmName, location, latitude, longitude, altitude, sizeHectares, varieties, caretakerName, caretakerNames, archived, googleMapsUrl, ownerNames } = body

    const updateData: any = {}
    if (farmName !== undefined) updateData.farmName = farmName
    if (location !== undefined) updateData.location = location
    if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(latitude) : null
    if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(longitude) : null
    if (altitude !== undefined) updateData.altitude = altitude
    if (sizeHectares !== undefined) updateData.sizeHectares = sizeHectares ? parseFloat(sizeHectares) : null
    if (varieties !== undefined) updateData.varieties = varieties
    if (caretakerNames !== undefined || caretakerName !== undefined) {
      updateData.caretakerNames = Array.isArray(caretakerNames)
        ? caretakerNames.map((name: unknown) => String(name).trim()).filter(Boolean)
        : (typeof caretakerName === 'string'
            ? caretakerName.split(',').map((name: string) => name.trim()).filter(Boolean)
            : [])
    }
    if (caretakerName !== undefined) updateData.caretakerName = caretakerName || null
    if (caretakerNames !== undefined && updateData.caretakerNames?.length > 0) {
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

    const updatedFarm = await prisma.farm.update({
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
      },
    })

    return NextResponse.json({ farm: updatedFarm })
  } catch (error) {
    return handleApiError(error)
  }
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
    if (!user.roles.includes('Admin') && farm.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Cascade delete: ลบ weather records ที่เกี่ยวข้องก่อน
    await prisma.weatherRecord.deleteMany({
      where: { farmId: id },
    })

    // จากนั้นลบ farm
    await prisma.farm.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Farm and related weather records deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
