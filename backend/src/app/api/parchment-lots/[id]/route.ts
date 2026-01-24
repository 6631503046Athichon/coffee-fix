import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// PATCH /api/parchment-lots/:id - Update parchment lot
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params
    const body = await request.json()

    const { status, currentWeightKg } = body

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (currentWeightKg !== undefined) updateData.currentWeightKg = parseFloat(currentWeightKg)

    const parchmentLot = await prisma.parchmentLot.update({
      where: { id },
      data: updateData,
      include: {
        processingBatch: {
          include: {
            harvestLot: true,
          },
        },
      },
    })

    return NextResponse.json({ parchmentLot, message: 'Parchment lot updated successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/parchment-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const parchmentLot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        processingBatch: {
          include: {
            harvestLot: {
              include: {
                farm: {
                  select: {
                    id: true,
                    farmName: true,
                    location: true,
                  },
                },
              },
            },
          },
        },
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
          },
        },
        physicalTestResults: true,
        greenBeanLots: true,
      },
    })

    if (!parchmentLot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ parchmentLot })
  } catch (error) {
    return handleApiError(error)
  }
}
