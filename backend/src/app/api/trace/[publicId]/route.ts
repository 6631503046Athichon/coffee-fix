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

    // SECURITY: This is a PUBLIC (unauthenticated) endpoint. Do not fetch
    // sensitive fields here — even if downstream code forgets to strip them,
    // they are never read out of the DB.
    //   - currentWeightKg / availabilityStatus: business inventory data
    //   - farmerName / farm.ownerNames: PII
    //   - latitude / longitude / googleMapsUrl: precise GPS coordinates
    const greenBeanLot = await prisma.greenBeanLot.findFirst({
      where: { publicTraceId: publicId },
      select: {
        id: true,
        grade: true,
        sourceType: true,
        externalSource: true,
        cuppingFragrance: true,
        cuppingFlavor: true,
        cuppingAftertaste: true,
        cuppingAcidity: true,
        cuppingBody: true,
        cuppingBalance: true,
        cuppingOverall: true,
        cuppingUniformity: true,
        cuppingCleanCup: true,
        cuppingSweetness: true,
        parchmentLot: {
          select: {
            id: true,
            processType: true,
            moistureContent: true,
            createdAt: true,
            processingBatch: {
              select: {
                id: true,
                processType: true,
                processNotes: true,
                baggingDate: true,
                dryingStartDate: true,
                dryingEndDate: true,
                harvestLot: {
                  select: {
                    id: true,
                    cherryVariety: true,
                    harvestDate: true,
                    farm: {
                      select: {
                        id: true,
                        farmName: true,
                        location: true,
                        altitude: true,
                        varieties: true,
                      },
                    },
                  },
                },
                dryingLogs: {
                  orderBy: { date: 'asc' },
                },
              },
            },
            harvestLot: {
              select: {
                id: true,
                cherryVariety: true,
                harvestDate: true,
                farmPlotLocation: true,
              },
            },
          },
        },
        roastBatches: {
          select: {
            id: true,
            roastDate: true,
            roastLevel: true,
            roastProfileNotes: true,
            flavorNotes: true,
            batchSizeKg: true,
            yieldPercentage: true,
            roaster: {
              select: {
                id: true,
                name: true,
              },
            },
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

    // Return sanitized public data (no sensitive info like prices, owner PII,
    // GPS coordinates, or inventory state).
    const publicData = {
      lot: {
        id: greenBeanLot.id,
        grade: greenBeanLot.grade,
        sourceType: greenBeanLot.sourceType,
        externalSource: greenBeanLot.externalSource,
        cuppingFragrance: greenBeanLot.cuppingFragrance,
        cuppingFlavor: greenBeanLot.cuppingFlavor,
        cuppingAftertaste: greenBeanLot.cuppingAftertaste,
        cuppingAcidity: greenBeanLot.cuppingAcidity,
        cuppingBody: greenBeanLot.cuppingBody,
        cuppingBalance: greenBeanLot.cuppingBalance,
        cuppingOverall: greenBeanLot.cuppingOverall,
        cuppingUniformity: greenBeanLot.cuppingUniformity,
        cuppingCleanCup: greenBeanLot.cuppingCleanCup,
        cuppingSweetness: greenBeanLot.cuppingSweetness,
        parchmentLot: greenBeanLot.parchmentLot,
        roastBatches: greenBeanLot.roastBatches,
      },
      traceId: publicId,
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
