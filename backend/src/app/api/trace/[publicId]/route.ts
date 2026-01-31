import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

// GET /api/trace/:publicId - PUBLIC endpoint (no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params

    const greenBeanLot = await prisma.greenBeanLot.findFirst({
      where: { publicTraceId: publicId },
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
                        altitude: true,
                        latitude: true,
                        longitude: true,
                      },
                    },
                  },
                },
                dryingLogs: {
                  orderBy: { date: 'asc' }
                }
              },
            },
            harvestLot: {
              select: {
                id: true,
                farmerName: true,
                cherryVariety: true,
                harvestDate: true,
                farmPlotLocation: true,
              }
            },
          },
        },
        cuppingScores: true,
        roastBatches: {
          include: {
            roaster: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: { roastDate: 'desc' },
        },
      },
    })

    if (!greenBeanLot) {
      return NextResponse.json(
        { error: 'Coffee lot not found' },
        { status: 404 }
      )
    }

    // Return sanitized public data (no sensitive info like prices or internal IDs)
    const publicData = {
      lot: {
        id: greenBeanLot.id,
        grade: greenBeanLot.grade,
        sourceType: greenBeanLot.sourceType,
        currentWeightKg: greenBeanLot.currentWeightKg,
        availabilityStatus: greenBeanLot.availabilityStatus,
        externalSource: greenBeanLot.externalSource,
        cuppingScores: greenBeanLot.cuppingScores,
        parchmentLot: greenBeanLot.parchmentLot,
        roastBatches: greenBeanLot.roastBatches.map(rb => ({
          id: rb.id,
          roastDate: rb.roastDate,
          roastLevel: rb.roastLevel,
          roastProfileNotes: rb.roastProfileNotes,
          flavorNotes: rb.flavorNotes,
          batchSizeKg: rb.batchSizeKg,
          yieldPercentage: rb.yieldPercentage,
          roaster: rb.roaster
        }))
      },
      traceId: publicId
    }

    return NextResponse.json(publicData)
  } catch (error) {
    return handleApiError(error)
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
