import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// POST /api/cupping-sessions/:id/samples - Add sample to session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { blindCode, greenBeanLotId, submitterInfo, originInfo, lotInfo } = body

    if (!blindCode || !submitterInfo || !originInfo || !lotInfo) {
      return NextResponse.json(
        { error: 'Blind code, submitter info, origin info, and lot info are required' },
        { status: 400 }
      )
    }

    const sample = await prisma.cuppingSample.create({
      data: {
        cuppingSessionId: id,
        blindCode,
        greenBeanLotId: greenBeanLotId || null,
        submitterInfo: JSON.stringify(submitterInfo),
        originInfo: JSON.stringify(originInfo),
        lotInfo: JSON.stringify(lotInfo),
      },
      include: {
        greenBeanLot: {
          select: {
            id: true,
            grade: true,
          },
        },
      },
    })

    return NextResponse.json(
      { sample, message: 'Sample added successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
