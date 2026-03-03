import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { nextDisplayId } from '@/lib/utils'

// GET /api/parchment-lots - List all parchment lots
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}
    
    // Filter by processingBatchId if provided
    const processingBatchId = request.nextUrl.searchParams.get('processingBatchId')
    if (processingBatchId) {
      where.processingBatchId = processingBatchId
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      where.status = status
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 200)

    const parchmentLots = await prisma.parchmentLot.findMany({
      where,
      take: limit,
      include: {
        processingBatch: {
          select: {
            id: true,
            processType: true,
            status: true,
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
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ parchmentLots })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/parchment-lots - Create new parchment lot
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can create parchment lots
    requireRole(user, ['Processor', 'Admin'])

    const body = await request.json()
    const { processingBatchId, harvestLotId, initialWeightKg, currentWeightKg, moistureContent, processType, status } = body

    // Validation
    if (!processingBatchId || !harvestLotId || !initialWeightKg || !moistureContent || !processType) {
      return NextResponse.json(
        { error: 'Processing batch ID, harvest lot ID, initial weight, moisture content, and process type are required' },
        { status: 400 }
      )
    }

    const displayId = await nextDisplayId(prisma.parchmentLot, 'PCH')

    const parchmentLot = await prisma.parchmentLot.create({
      data: {
        displayId,
        processingBatchId,
        harvestLotId,
        initialWeightKg: parseFloat(initialWeightKg),
        currentWeightKg: currentWeightKg ? parseFloat(currentWeightKg) : parseFloat(initialWeightKg),
        moistureContent: parseFloat(moistureContent),
        processType,
        status: status || 'AwaitingHulling',
      },
      include: {
        processingBatch: {
          select: {
            id: true,
            processType: true,
            status: true,
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
    })

    return NextResponse.json(
      { parchmentLot, message: 'Parchment lot created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/parchment-lots/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request)

    const body = await request.json()
    const { currentWeightKg, moistureContent, status, physicalTestResults } = body

    const updateData: any = {}
    if (currentWeightKg !== undefined) updateData.currentWeightKg = parseFloat(currentWeightKg)
    if (moistureContent !== undefined) updateData.moistureContent = parseFloat(moistureContent)
    if (status !== undefined) updateData.status = status

    // Update or create physical test results
    if (physicalTestResults) {
      const { sampleWeightGrams, greenBeanWeightGrams, greenBeanMoisture, waterActivity, density, defectCount, notes } = physicalTestResults

      await prisma.$transaction(async (tx) => {
        await tx.parchmentLot.update({
          where: { id: params.id },
          data: updateData,
        })

        await tx.physicalTestResults.upsert({
          where: { parchmentLotId: params.id },
          update: {
            sampleWeightGrams: parseFloat(sampleWeightGrams),
            greenBeanWeightGrams: parseFloat(greenBeanWeightGrams),
            greenBeanMoisture: parseFloat(greenBeanMoisture),
            waterActivity: parseFloat(waterActivity),
            density: parseFloat(density),
            defectCount: parseInt(defectCount),
            notes: notes || null,
          },
          create: {
            parchmentLotId: params.id,
            sampleWeightGrams: parseFloat(sampleWeightGrams),
            greenBeanWeightGrams: parseFloat(greenBeanWeightGrams),
            greenBeanMoisture: parseFloat(greenBeanMoisture),
            waterActivity: parseFloat(waterActivity),
            density: parseFloat(density),
            defectCount: parseInt(defectCount),
            notes: notes || null,
          },
        })
      })
    } else {
      await prisma.parchmentLot.update({
        where: { id: params.id },
        data: updateData,
      })
    }

    const updatedLot = await prisma.parchmentLot.findUnique({
      where: { id: params.id },
      include: {
        processingBatch: {
          select: {
            id: true,
            processType: true,
            status: true,
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
      },
    })

    return NextResponse.json({ parchmentLot: updatedLot })
  } catch (error) {
    return handleApiError(error)
  }
}

