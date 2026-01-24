import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/farm-requests/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const farmRequest = await prisma.farmRequest.findUnique({
      where: { id },
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
    })

    if (!farmRequest) {
      return NextResponse.json(
        { error: 'Farm request not found' },
        { status: 404 }
      )
    }

    // Check permission
    if (!user.roles.includes('Admin') && farmRequest.requesterId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json({ farmRequest })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/farm-requests/:id - Update farm request (approve/reject)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const farmRequest = await prisma.farmRequest.findUnique({
      where: { id },
    })

    if (!farmRequest) {
      return NextResponse.json(
        { error: 'Farm request not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { status, adminNotes } = body

    if (!status || !['Approved', 'Rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be Approved or Rejected' },
        { status: 400 }
      )
    }

    const updateData: any = {
      status,
      reviewDate: new Date(),
      reviewedBy: user.id,
    }

    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes
    }

    // If approved, create the farm
    if (status === 'Approved') {
      await prisma.$transaction(async (tx) => {
        // Update the request
        await tx.farmRequest.update({
          where: { id },
          data: updateData,
        })

        // Create the farm
        await tx.farm.create({
          data: {
            farmName: farmRequest.farmName,
            location: farmRequest.location,
            latitude: farmRequest.latitude,
            longitude: farmRequest.longitude,
            altitude: farmRequest.altitude,
            ownerId: farmRequest.requesterId,
          },
        })
      })
    } else {
      // Just update the request
      await prisma.farmRequest.update({
        where: { id },
        data: updateData,
      })
    }

    const updatedRequest = await prisma.farmRequest.findUnique({
      where: { id },
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
    })

    return NextResponse.json({ farmRequest: updatedRequest })
  } catch (error) {
    return handleApiError(error)
  }
}
