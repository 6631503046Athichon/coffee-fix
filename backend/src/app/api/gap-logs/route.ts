import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { farmIdFilter, farmMemberSelect, requireFarmAccess } from '@/lib/farmAccess'

// GET /api/gap-logs - List all GAP logs
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.GAPLogEntryWhereInput = {}

    // Admins see every log (legacy logs without a farm included); everyone
    // else only the farms they own or collaborate on, and only the requested
    // one when ?farmId= is given. No farms means no logs.
    const farmId = await farmIdFilter(user, request.nextUrl.searchParams.get('farmId'))
    if (farmId) {
      where.farmId = farmId
    }

    // Filter by activityTypeId if provided
    const activityTypeId = request.nextUrl.searchParams.get('activityTypeId')
    if (activityTypeId) {
      where.activityTypeId = activityTypeId
    }

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

    // SECURITY: If farmId is provided, the caller must own the farm,
    // collaborate on it, or be an Admin.
    if (farmId) {
      const farm = await prisma.farm.findUnique({
        where: { id: farmId },
        select: farmMemberSelect(user.id),
      })

      if (!farm) {
        return NextResponse.json(
          { error: 'Farm not found' },
          { status: 404 }
        )
      }

      requireFarmAccess(user, farm)
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

