import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/processing-batches - List all processing batches
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}
    
    // Filter by harvestLotId if provided
    const harvestLotId = request.nextUrl.searchParams.get('harvestLotId')
    if (harvestLotId) {
      where.harvestLotId = harvestLotId
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      where.status = status
    }

    const processingBatches = await prisma.processingBatch.findMany({
      where,
      include: {
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
            weightKg: true,
          },
        },
        cropYear: {
          select: {
            id: true,
            year: true,
          },
        },
        dryingLogs: {
          orderBy: { date: 'asc' },
        },
        parchmentLots: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ processingBatches })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/processing-batches - Create new processing batch
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])

    const body = await request.json()
    const {
      harvestLotId,
      status,
      processType,
      processNotes,
      cropYearId,
      parchmentWeightKg,
      moistureContent,
      dryingStartDate,
      dryingEndDate,
      baggingDate
    } = body

    // Validation
    if (!harvestLotId || !processType) {
      return NextResponse.json(
        { error: 'Harvest lot ID and process type are required' },
        { status: 400 }
      )
    }

    // Use transaction to create batch and update harvest lot status atomically
    const processingBatch = await prisma.$transaction(async (tx) => {
      // Create processing batch
      const batch = await tx.processingBatch.create({
        data: {
          harvestLotId,
          status: status || 'ToProcess',
          processType,
          processNotes: processNotes || null,
          cropYearId: cropYearId || null,
          createdById: user.id,
          parchmentWeightKg: parchmentWeightKg ? parseFloat(parchmentWeightKg) : null,
          moistureContent: moistureContent ? parseFloat(moistureContent) : null,
          dryingStartDate: dryingStartDate ? new Date(dryingStartDate) : null,
          dryingEndDate: dryingEndDate ? new Date(dryingEndDate) : null,
          baggingDate: baggingDate ? new Date(baggingDate) : null,
        },
        include: {
          harvestLot: {
            select: {
              id: true,
              farmerName: true,
              cherryVariety: true,
              weightKg: true,
            },
          },
          cropYear: {
            select: {
              id: true,
              year: true,
            },
          },
          dryingLogs: {
            orderBy: { date: 'asc' },
          },
          parchmentLots: true,
        },
      });

      // If status is Completed and we have parchment data, create parchment lot
      if (status === 'Completed' && parchmentWeightKg && moistureContent) {
        await tx.parchmentLot.create({
          data: {
            processingBatchId: batch.id,
            harvestLotId: harvestLotId,
            initialWeightKg: parseFloat(parchmentWeightKg),
            currentWeightKg: parseFloat(parchmentWeightKg),
            moistureContent: parseFloat(moistureContent),
            processType: processType,
            status: 'AwaitingHulling',
          },
        });
      }

      // Update harvest lot status to 'Completed' if batch is completed
      await tx.harvestLot.update({
        where: { id: harvestLotId },
        data: { status: status === 'Completed' ? 'Completed' : 'Processing' },
      });

      return batch;
    })

    return NextResponse.json(
      { processingBatch, message: 'Processing batch created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

