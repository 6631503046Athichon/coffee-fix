import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/gap-logs - List all GAP logs
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.GAPLogEntryWhereInput = {}
    
    // Filter by farmId if provided
    const farmId = request.nextUrl.searchParams.get('farmId')
    if (farmId) {
      where.farmId = farmId
    }

    // Filter by activityTypeId if provided
    const activityTypeId = request.nextUrl.searchParams.get('activityTypeId')
    if (activityTypeId) {
      where.activityTypeId = activityTypeId
    }

    // Farmers can only see their own farms' GAP logs
    // Admins can see all GAP logs
    if (user.roles.includes('Farmer') && !user.roles.includes('Admin')) {
      const farms = await prisma.farm.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      })
      const farmIds = farms.map(f => f.id)
      // Include logs with no farmId (legacy logs) only if user has farms
      if (farmIds.length > 0) {
        where.farmId = { in: farmIds }
      } else {
        // If user has no farms, only show logs with no farmId
        where.farmId = null
      }
    }
    // Admins see all logs (no filter applied)

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 200)

    const gapLogs = await prisma.gAPLogEntry.findMany({
      where,
      take: limit,
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
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ gapLogs })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/gap-logs - Create new GAP log
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Admin'])

    const body = await request.json()
    const { farmId, farmPlotLocation, activityTypeId, date, productUsed, quantity, notes } = body

    // Validation
    if (!farmPlotLocation || !activityTypeId || !date || !productUsed || !quantity) {
      return NextResponse.json(
        { error: 'Farm plot location, activity type, date, product used, and quantity are required' },
        { status: 400 }
      )
    }

    // Get activity type to get the name
    const activityType = await prisma.activityType.findUnique({
      where: { id: activityTypeId },
    })

    if (!activityType) {
      return NextResponse.json(
        { error: 'Activity type not found' },
        { status: 404 }
      )
    }

    const gapLog = await prisma.gAPLogEntry.create({
      data: {
        farmId: farmId || null,
        farmPlotLocation,
        activityTypeId,
        activityTypeName: activityType.name,
        date: new Date(date),
        productUsed,
        quantity,
        notes: notes || null,
        createdBy: user.id,
      },
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

    return NextResponse.json(
      { gapLog, message: 'GAP log created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

