import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, createFarmSchema } from '@/lib/validations'

// This route depends on auth cookies/headers, so it must be dynamic.
export const dynamic = 'force-dynamic'

// GET /api/farms - List all farms
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Farmers can only see their own farms + farms they collaborate on, admins can see all
    const isAdmin = user.roles.includes('Admin')
    let where: Record<string, unknown> = {}
    if (!isAdmin) {
      where = {
        OR: [
          { ownerId: user.id },
          { collaborators: { some: { userId: user.id } } },
        ],
      }
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
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, roles: true } },
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

    // Validate request body with Zod
    const validation = await validateBody(request, createFarmSchema)
    if (!validation.success) {
      return validation.error
    }

    const {
      farmName,
      location,
      latitude,
      longitude,
      altitude,
      sizeHectares,
      varieties,
      caretakerName,
      caretakerNames,
      ownerId,
      googleMapsUrl,
      ownerNames,
    } = validation.data

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
        ownerNames: ownerNames || [],
        location,
        latitude: latitude || null,
        longitude: longitude || null,
        altitude: altitude || null,
        sizeHectares: sizeHectares || null,
        varieties: varieties || [],
        caretakerNames: caretakerNames || [],
        caretakerName: caretakerName || null,
        googleMapsUrl: googleMapsUrl || null,
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
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, roles: true } },
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

