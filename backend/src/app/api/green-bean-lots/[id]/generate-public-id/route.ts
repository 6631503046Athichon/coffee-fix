import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { BODY_NOT_OBJECT_MESSAGE, readJsonObjectBody } from '@/lib/withdrawalVoid'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const traceSelect = { id: true, publicTraceId: true, qrGeneratedAt: true } as const

type TraceFields = { id: string; publicTraceId: string; qrGeneratedAt: Date | null }

const traceResponse = (lot: TraceFields) =>
  NextResponse.json({
    greenBeanLot: lot,
    publicTraceId: lot.publicTraceId,
    publicUrl: `/trace/${lot.publicTraceId}`
  })

// POST /api/green-bean-lots/:id/generate-public-id
// Body (optional): { regenerate?: boolean }
//
// The public trace id ends up printed on QR labels and invoices, so once a lot
// has one it is kept: without { regenerate: true } the existing id comes back
// unchanged, so a caller deciding from a stale copy of the lot (no id yet)
// cannot replace it by accident. Only an explicit regenerate mints a new id,
// which breaks every QR code printed with the old one.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // Check if lot exists
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: { ...traceSelect, createdById: true }
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Only the lot creator (or Admin) can generate a public trace ID.
    requireOwnership(user, lot.createdById, ['Admin'])

    const body = await readJsonObjectBody(request)
    if (!body) {
      return NextResponse.json({ error: BODY_NOT_OBJECT_MESSAGE }, { status: 400 })
    }
    const regenerate = body.regenerate ?? false
    if (typeof regenerate !== 'boolean') {
      return NextResponse.json({ error: 'regenerate must be true or false' }, { status: 400 })
    }

    if (lot.publicTraceId && !regenerate) {
      return traceResponse({ id: lot.id, publicTraceId: lot.publicTraceId, qrGeneratedAt: lot.qrGeneratedAt })
    }

    // Generate new public ID
    const data = { publicTraceId: randomUUID(), qrGeneratedAt: new Date() }

    if (regenerate) {
      await prisma.greenBeanLot.update({ where: { id }, data, select: traceSelect })
      return traceResponse({ id, ...data })
    }

    // First publish: only fill an empty id, so two first-time requests racing
    // each other end with one id instead of the later replacing the earlier.
    const { count } = await prisma.greenBeanLot.updateMany({
      where: { id, publicTraceId: null },
      data
    })
    if (count === 1) return traceResponse({ id, ...data })

    const current = await prisma.greenBeanLot.findUnique({ where: { id }, select: traceSelect })
    if (!current?.publicTraceId) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }
    return traceResponse({ id: current.id, publicTraceId: current.publicTraceId, qrGeneratedAt: current.qrGeneratedAt })
  } catch (error) {
    return handleApiError(error)
  }
}
