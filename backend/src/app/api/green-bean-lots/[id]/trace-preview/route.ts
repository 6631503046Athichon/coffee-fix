import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { serializeStaffTrace, staffTraceSelect } from '@/lib/trace'

export const dynamic = 'force-dynamic'

// GET /api/green-bean-lots/:id/trace-preview
// The traceability story of a lot, for staff to check before (and after) it is
// published. traceId is null until a public id has been generated.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    const owner = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: { createdById: true, publicTraceId: true }
    })

    if (!owner) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: same rule as generate-public-id — only the lot creator (or
    // Admin) may see a lot before it is public. Once published, anyone can
    // already read this story at /api/trace/:publicId, so any Processor may.
    if (!owner.publicTraceId) {
      requireOwnership(user, owner.createdById, ['Admin'])
    }

    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: staffTraceSelect
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(serializeStaffTrace(lot, owner.publicTraceId))
  } catch (error) {
    return handleApiError(error)
  }
}
