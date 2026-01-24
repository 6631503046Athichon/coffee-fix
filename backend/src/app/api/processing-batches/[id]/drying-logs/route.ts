import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// POST /api/processing-batches/:id/drying-logs - Add drying log entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { date, moistureContent, ambientTemp, relativeHumidity } = body

    if (!date || moistureContent === undefined || ambientTemp === undefined || relativeHumidity === undefined) {
      return NextResponse.json(
        { error: 'Date, moisture content, ambient temperature, and relative humidity are required' },
        { status: 400 }
      )
    }

    const dryingLog = await prisma.dryingLogEntry.create({
      data: {
        processingBatchId: id,
        date: new Date(date),
        moistureContent: parseFloat(moistureContent),
        ambientTemp: parseFloat(ambientTemp),
        relativeHumidity: parseFloat(relativeHumidity),
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
