import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/activity-types - List all activity types
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: Prisma.ActivityTypeWhereInput = {}
    
    // Filter by isActive if provided
    const isActive = request.nextUrl.searchParams.get('isActive')
    if (isActive !== null) {
      where.isActive = isActive === 'true'
    }

    const activityTypes = await prisma.activityType.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ activityTypes })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/activity-types - Create new activity type
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const body = await request.json()
    const { name, description, isActive } = body

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const activityType = await prisma.activityType.create({
      data: {
        name,
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json(
      { activityType, message: 'Activity type created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

