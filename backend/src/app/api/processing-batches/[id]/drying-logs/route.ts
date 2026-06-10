import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'

// POST /api/processing-batches/:id/drying-logs - Add drying log entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // Load the parent batch for ownership check
    const batch = await prisma.processingBatch.findUnique({
      where: { id },
      select: { createdById: true },
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Processing batch not found' },
        { status: 404 }
      )
    }

    requireOwnership(user, batch.createdById, ['Admin'])

    const body = await request.json()
    const { date, moistureContent, ambientTemp, relativeHumidity } = body

    if (!date || moistureContent === undefined || ambientTemp === undefined || relativeHumidity === undefined) {
      return NextResponse.json(
        { error: 'Date, moisture content, ambient temperature, and relative humidity are required' },
        { status: 400 }
      )
    }

    const moisture = safeParseFloat(moistureContent)
    const ambient = safeParseFloat(ambientTemp)
    const humidity = safeParseFloat(relativeHumidity)

    if (moisture === null || ambient === null || humidity === null) {
      return NextResponse.json(
        { error: 'Moisture content, ambient temperature, and relative humidity must be valid numbers' },
        { status: 400 }
      )
    }

    const dryingLog = await prisma.dryingLogEntry.create({
      data: {
        processingBatchId: id,
        date: new Date(date),
        moistureContent: moisture,
        ambientTemp: ambient,
        relativeHumidity: humidity,
      },
    })

    return NextResponse.json(
      { dryingLog, message: 'Drying log entry added successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
