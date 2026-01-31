import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// POST /api/green-bean-lots/:id/generate-public-id
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    // Check if lot exists
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: { id: true, publicTraceId: true }
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    // Generate new public ID
    const publicTraceId = randomUUID()

    const updatedLot = await prisma.greenBeanLot.update({
      where: { id },
      data: {
        publicTraceId,
        qrGeneratedAt: new Date()
      },
      select: {
        id: true,
        publicTraceId: true,
        qrGeneratedAt: true
      }
    })

    return NextResponse.json({
      greenBeanLot: updatedLot,
      publicTraceId,
      publicUrl: `/trace/${publicTraceId}`
    })
  } catch (error) {
    return handleApiError(error)
  }
}
