import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/weather-records - List all weather records
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.WeatherRecordWhereInput = {}
    
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

    // Cap sized for the worst-case scenario the demo wants to support:
    // 5-minute auto-fetch × 2 years × 1 farm ≈ 210,000 rows. We bump the
    // upper bound to 250,000 so the API can return a full historical
    // window when the client asks for one (typically scoped via
    // startDate/endDate). Default page is small (1,000) so the DataContext
    // initial load stays light.
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '1000', 10), 250000)

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

    // SECURITY: Verify the farm exists and is owned by the caller.
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { ownerId: true, createdAt: true },
    })

    if (!farm) {
      return NextResponse.json(
        { error: 'Farm not found' },
        { status: 404 }
      )
    }

    requireOwnership(user, farm.ownerId, ['Admin'])

    // Clamp recordDate to [farm.createdAt, now + 1 day] so callers cannot
    // backfill records before the farm existed or fabricate far-future data.
    const parsedRecordDate = new Date(recordDate)
    if (Number.isNaN(parsedRecordDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid recordDate' },
        { status: 400 }
      )
    }
    const oneDayAhead = new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (parsedRecordDate < farm.createdAt || parsedRecordDate > oneDayAhead) {
      return NextResponse.json(
        { error: 'recordDate must be between the farm creation date and one day from now' },
        { status: 400 }
      )
    }

    // Dedup safety net for API-source auto-fetches: if a fresh API record
    // for this farm already exists within the last 60s, return it instead
    // of creating a duplicate. The client side has its own in-flight lock,
    // but this guards against rogue concurrent callers (multiple browser
    // tabs, retried requests, StrictMode races) ending up with two rows
    // at the same minute.
    if (source === 'API') {
      const sixtySecondsAgo = new Date(Date.now() - 60_000)
      const recent = await prisma.weatherRecord.findFirst({
        where: {
          farmId,
          source: 'API',
          createdAt: { gte: sixtySecondsAgo },
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
        orderBy: { createdAt: 'desc' },
      })
      if (recent) {
        return NextResponse.json(
          {
            weatherRecord: recent,
            message: 'Skipped duplicate API record (within 60s window)',
          },
          { status: 200 },
        )
      }
    }

    const weatherRecord = await prisma.weatherRecord.create({
      data: {
        farmId,
        farmPlotLocation,
        recordDate: parsedRecordDate,
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

