import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/farms - List all farms
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Farmers can only see their own farms, admins can see all
    const where: any = {}
    if (!user.roles.includes('Admin')) {
      where.ownerId = user.id
    }

    const farms = await prisma.farm.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ farms })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/farms - Create new farm
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Admin'])

    const body = await request.json()
    const { farmName, location, latitude, longitude, altitude, sizeHectares, varieties, caretakerName, ownerId } = body

    // Validation
    if (!farmName || !location) {
      return NextResponse.json(
        { error: 'Farm name and location are required' },
        { status: 400 }
      )
    }

    // Use provided ownerId or current user's id
    const finalOwnerId = ownerId || user.id

    // If not admin, can only create farms for themselves
    if (!user.roles.includes('Admin') && finalOwnerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const farm = await prisma.farm.create({
      data: {
        farmName,
        location,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        altitude: altitude || null,
        sizeHectares: sizeHectares ? parseFloat(sizeHectares) : null,
        varieties: varieties || [],
        caretakerName: caretakerName || null,
        ownerId: finalOwnerId,
      },
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

    return NextResponse.json(
      { farm, message: 'Farm created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

