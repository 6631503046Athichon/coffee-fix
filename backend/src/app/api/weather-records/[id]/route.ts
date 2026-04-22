import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/weather-records/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const weatherRecord = await prisma.weatherRecord.findUnique({
      where: { id },
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

    if (!weatherRecord) {
      return NextResponse.json(
        { error: 'Weather record not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ weatherRecord })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/weather-records/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

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

    // Use UncheckedUpdateInput so we can assign scalar FKs (farmId) directly
    // without needing a nested `connect`.
    const updateData: Prisma.WeatherRecordUncheckedUpdateInput = {}
    if (farmId !== undefined) updateData.farmId = farmId
    if (farmPlotLocation !== undefined) updateData.farmPlotLocation = farmPlotLocation
    if (recordDate !== undefined) updateData.recordDate = new Date(recordDate)
    if (temperatureMin !== undefined) updateData.temperatureMin = parseFloat(temperatureMin)
    if (temperatureMax !== undefined) updateData.temperatureMax = parseFloat(temperatureMax)
    if (temperatureAvg !== undefined) updateData.temperatureAvg = parseFloat(temperatureAvg)
    if (rainfall !== undefined) updateData.rainfall = parseFloat(rainfall)
    if (humidity !== undefined) updateData.humidity = parseFloat(humidity)
    if (source !== undefined) updateData.source = source
    if (notes !== undefined) updateData.notes = notes

    const updatedWeatherRecord = await prisma.weatherRecord.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ weatherRecord: updatedWeatherRecord })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/weather-records/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    await prisma.weatherRecord.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Weather record deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
