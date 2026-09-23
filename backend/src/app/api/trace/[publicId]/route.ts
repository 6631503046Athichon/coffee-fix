import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { handleApiError } from '@/lib/middleware'
import { publicTraceSelect, serializePublicTrace } from '@/lib/trace'

export const dynamic = 'force-dynamic'

// GET /api/trace/:publicId - PUBLIC endpoint (no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params

    // SECURITY: This is a PUBLIC (unauthenticated) endpoint. publicTraceSelect
    // never reads sensitive fields out of the DB — see lib/trace.ts.
    const greenBeanLot = await prisma.greenBeanLot.findFirst({
      where: { publicTraceId: publicId },
      select: publicTraceSelect,
    })

    if (!greenBeanLot) {
      return NextResponse.json(
        { error: 'Coffee lot not found' },
        { status: 404 }
      )
    }

    // Return sanitized public data. Location Details are intentionally included
    // so the public traceability page can show the farm map.
    return NextResponse.json(serializePublicTrace(greenBeanLot, publicId))
  } catch (error) {
    return handleApiError(error)
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
