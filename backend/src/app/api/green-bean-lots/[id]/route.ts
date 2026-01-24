import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/green-bean-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const greenBeanLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        parchmentLot: {
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
          },
        },
        priceSetter: {
          select: {
            id: true,
            name: true,
          },
        },
        cuppingScores: true,
        withdrawalHistory: {
          include: {
            withdrawnByUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { date: 'desc' },
        },
        roasterInventory: {
          include: {
            roaster: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        roastBatches: {
          orderBy: { roastDate: 'desc' },
        },
      },
    })

    if (!greenBeanLot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ greenBeanLot })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/green-bean-lots/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { grade, currentWeightKg, availabilityStatus, pricePerKg, currency, priceSetDate } = body

    const updateData: any = {}
    if (grade !== undefined) updateData.grade = grade
    if (currentWeightKg !== undefined) updateData.currentWeightKg = parseFloat(currentWeightKg)
    if (availabilityStatus !== undefined) updateData.availabilityStatus = availabilityStatus
    if (pricePerKg !== undefined) updateData.pricePerKg = pricePerKg ? parseFloat(pricePerKg) : null
    if (currency !== undefined) updateData.currency = currency
    if (priceSetDate !== undefined) {
      updateData.priceSetDate = priceSetDate ? new Date(priceSetDate) : null
      updateData.priceSetBy = user.id
    }

    const updatedLot = await prisma.greenBeanLot.update({
      where: { id },
      data: updateData,
      include: {
        parchmentLot: {
          include: {
            processingBatch: {
              select: {
                id: true,
                processType: true,
              },
            },
            harvestLot: {
              select: {
                id: true,
                farmerName: true,
                cherryVariety: true,
              },
            },
          },
        },
        priceSetter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Create pricing history entry if price was set
    if (pricePerKg && currency) {
      await prisma.pricingHistory.create({
        data: {
          greenBeanLotId: id,
          pricePerKg: parseFloat(pricePerKg),
          currency,
          effectiveDate: priceSetDate ? new Date(priceSetDate) : new Date(),
          setBy: user.id,
        },
      })
    }

    return NextResponse.json({ greenBeanLot: updatedLot })
  } catch (error) {
    return handleApiError(error)
  }
}
