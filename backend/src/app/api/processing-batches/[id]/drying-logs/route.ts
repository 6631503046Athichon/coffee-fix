import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { loadBatchForDryingLogs, parseDryingLogInput, type DryingLogFields } from '@/lib/dryingLogs'

// POST /api/processing-batches/:id/drying-logs - Add drying log entry
// The batch's processor, or an Admin on anyone's batch.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const batch = await loadBatchForDryingLogs(user, id)
    if (!batch) {
      return NextResponse.json(
        { error: 'Processing batch not found' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => null)
    const parsed = parseDryingLogInput(body, { partial: false })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const reading = parsed.data as DryingLogFields

    const dryingLog = await prisma.dryingLogEntry.create({
      data: {
        processingBatchId: id,
        date: reading.date,
        moistureContent: reading.moistureContent,
        ambientTemp: reading.ambientTemp,
        relativeHumidity: reading.relativeHumidity,
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
