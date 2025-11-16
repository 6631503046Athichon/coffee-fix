import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/farm-requests - List all farm requests
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Farmers can only see their own requests, admins can see all
    const where: any = {}
    if (!user.roles.includes('Admin')) {
      where.requesterId = user.id
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      where.status = status
    }

    const farmRequests = await prisma.farmRequest.findMany({
      where,
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { requestDate: 'desc' },
    })

    return NextResponse.json({ farmRequests })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/farm-requests - Create new farm request
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Admin'])

    const body = await request.json()
    const { farmName, location, altitude, size, latitude, longitude, reason } = body

    // Validation
    if (!farmName || !location || !reason) {
      return NextResponse.json(
        { error: 'Farm name, location, and reason are required' },
        { status: 400 }
      )
    }

    const farmRequest = await prisma.farmRequest.create({
      data: {
        farmName,
        location,
        altitude: altitude || null,
        size: size || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        ownerName: user.name,
        requesterId: user.id,
        reason,
        status: 'Pending',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(
      { farmRequest, message: 'Farm request created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

