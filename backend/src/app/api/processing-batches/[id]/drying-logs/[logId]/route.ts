import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { loadBatchForDryingLogs, parseDryingLogInput } from '@/lib/dryingLogs'

type RouteParams = { params: Promise<{ id: string; logId: string }> }

const notFound = (what: string) =>
  NextResponse.json({ error: `${what} not found` }, { status: 404 })

// Both routes match the reading by its id AND the batch in the path, so a
// log id from another batch is never reachable through a batch the caller
// owns, and a reading removed meanwhile is a 404, not a 500.

// PUT /api/processing-batches/:id/drying-logs/:logId - Correct a reading
// Same rule as adding one: the batch's processor, or an Admin.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request)
    const { id, logId } = await params

    const batch = await loadBatchForDryingLogs(user, id)
    if (!batch) return notFound('Processing batch')

    const body = await request.json().catch(() => null)
    const parsed = parseDryingLogInput(body, { partial: true })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { count } = await prisma.dryingLogEntry.updateMany({
      where: { id: logId, processingBatchId: id },
      data: parsed.data,
    })
    if (count === 0) return notFound('Drying log entry')

    const dryingLog = await prisma.dryingLogEntry.findUnique({ where: { id: logId } })
    return NextResponse.json({ dryingLog, message: 'Drying log entry updated successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/processing-batches/:id/drying-logs/:logId - Remove a reading
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request)
    const { id, logId } = await params

    const batch = await loadBatchForDryingLogs(user, id)
    if (!batch) return notFound('Processing batch')

    const { count } = await prisma.dryingLogEntry.deleteMany({
      where: { id: logId, processingBatchId: id },
    })
    if (count === 0) return notFound('Drying log entry')

    return NextResponse.json({ id: logId, message: 'Drying log entry deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
