import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/weather-records - List all weather records
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: any = {}
    
    // Filter by farmId if provided
    const farmId = request.nextUrl.searchParams.get('farmId')
    if (farmId) {
      where.farmId = farmId
    }

    // Filter by date range if provided
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    if (startDate || endDate) {
      where.recordDate = {}
      if (startDate) where.recordDate.gte = new Date(startDate)
      if (endDate) where.recordDate.lte = new Date(endDate)
    }

    // Farmers can only see their own farms' weather records
    if (user.roles.includes('Farmer') && !user.roles.includes('Admin')) {
      const farms = await prisma.farm.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      })
      where.farmId = { in: farms.map(f => f.id) }
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 200)

    const weatherRecords = await prisma.weatherRecord.findMany({
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
        recordedByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { recordDate: 'desc' },
    })

    return NextResponse.json({ weatherRecords })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/weather-records - Create new weather record
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Admin'])

    const body = await request.json()
    const {
      farmId,
      farmPlotLocation,
      recordDate,
      temperatureMin,
      temperatureMax,
      temperatureAvg,
      rainfall,
      humidity,
      source,
      notes,
    } = body

    // Validation
    if (!farmId || !farmPlotLocation || !recordDate || 
        temperatureMin === undefined || temperatureMax === undefined || 
        temperatureAvg === undefined || rainfall === undefined || humidity === undefined) {
      return NextResponse.json(
        { error: 'Farm ID, farm plot location, record date, and all weather data are required' },
        { status: 400 }
      )
    }

    const weatherRecord = await prisma.weatherRecord.create({
      data: {
        farmId,
        farmPlotLocation,
        recordDate: new Date(recordDate),
        temperatureMin: parseFloat(temperatureMin),
        temperatureMax: parseFloat(temperatureMax),
        temperatureAvg: parseFloat(temperatureAvg),
        rainfall: parseFloat(rainfall),
        humidity: parseFloat(humidity),
        source: source || 'Manual',
        notes: notes || null,
        recordedBy: user.id,
      },
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
          },
        },
        recordedByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(
      { weatherRecord, message: 'Weather record created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

