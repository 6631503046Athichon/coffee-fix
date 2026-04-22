import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat, nextDisplayId } from '@/lib/utils'

// POST /api/parchment-lots/process-and-hull - Combined Record Process + Hull & Grade
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Admin'])

    const body = await request.json()
    const {
      harvestLotId, processType, processNotes, cropYearId,
      parchmentWeightKg, moistureContent,
      dryingStartDate, dryingEndDate,
      gradedLots,
    } = body

    // Validation
    if (!harvestLotId || !processType) {
      return NextResponse.json(
        { error: 'Harvest lot ID and process type are required' },
        { status: 400 }
      )
    }

    const parsedParchmentWeight = safeParseFloat(parchmentWeightKg)
    const parsedMoistureContent = safeParseFloat(moistureContent)

    if (parsedParchmentWeight === null || parsedParchmentWeight <= 0) {
      return NextResponse.json(
        { error: 'Valid parchment weight is required' },
        { status: 400 }
      )
    }

    if (parsedMoistureContent === null || parsedMoistureContent < 0 || parsedMoistureContent > 100) {
      return NextResponse.json(
        { error: 'Valid moisture content (0-100) is required' },
        { status: 400 }
      )
    }

    if (!gradedLots || !Array.isArray(gradedLots) || gradedLots.length === 0) {
      return NextResponse.json(
        { error: 'At least one graded lot is required' },
        { status: 400 }
      )
    }

    if (!dryingStartDate || !dryingEndDate) {
      return NextResponse.json(
        { error: 'Drying start date and drying end date are required' },
        { status: 400 }
      )
    }

    const dryingStart = new Date(dryingStartDate)
    const dryingEnd = new Date(dryingEndDate)
    if (Number.isNaN(dryingStart.getTime()) || Number.isNaN(dryingEnd.getTime())) {
      return NextResponse.json(
        { error: 'Drying dates must be valid dates' },
        { status: 400 }
      )
    }

    if (dryingEnd < dryingStart) {
      return NextResponse.json(
        { error: 'Drying end date cannot be before drying start date' },
        { status: 400 }
      )
    }

    let gradedWeightSum = 0
    const seenGrades = new Set<string>()
    for (let i = 0; i < gradedLots.length; i++) {
      const gl = gradedLots[i]
      const grade = typeof gl?.grade === 'string' ? gl.grade.trim() : ''
      const weight = safeParseFloat(gl?.weight)

      if (!grade || weight === null || weight <= 0) {
        return NextResponse.json(
          { error: 'Each graded lot must include a unique grade and a weight greater than 0' },
          { status: 400 }
        )
      }

      if (seenGrades.has(grade)) {
        return NextResponse.json(
          { error: `Duplicate grade is not allowed: ${grade}` },
          { status: 400 }
        )
      }

      seenGrades.add(grade)
      gradedWeightSum += weight
    }

    // Validate harvest lot
    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id: harvestLotId },
      select: { id: true, weightKg: true, remainingWeightKg: true },
    })

    if (!harvestLot) {
      return NextResponse.json(
        { error: 'Harvest lot not found' },
        { status: 404 }
      )
    }

    const availableWeight = harvestLot.remainingWeightKg ?? harvestLot.weightKg
    if (parsedParchmentWeight > availableWeight) {
      return NextResponse.json(
        { error: `Parchment weight (${parsedParchmentWeight} kg) exceeds available harvest lot weight (${availableWeight.toFixed(2)} kg)` },
        { status: 400 }
      )
    }

    if (gradedWeightSum - parsedParchmentWeight > 0.01) {
      return NextResponse.json(
        { error: 'Total green bean weight cannot exceed parchment weight' },
        { status: 400 }
      )
    }

    // Pre-generate display IDs
    const batchDisplayId = await nextDisplayId(prisma.processingBatch, 'PB')
    const parchmentDisplayId = await nextDisplayId(prisma.parchmentLot, 'PCH')
    const greenBeanDisplayIds: string[] = []
    for (let i = 0; i < gradedLots.length; i++) {
      greenBeanDisplayIds.push(await nextDisplayId(prisma.greenBeanLot, 'GBL'))
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create ProcessingBatch (status: Completed)
      const batch = await tx.processingBatch.create({
        data: {
          displayId: batchDisplayId,
          harvestLotId,
          status: 'Completed',
          processType,
          processNotes: processNotes || null,
          cropYearId: cropYearId || null,
          createdById: user.id,
          parchmentWeightKg: parsedParchmentWeight,
          moistureContent: parsedMoistureContent,
          dryingStartDate: dryingStart,
          dryingEndDate: dryingEnd,
        },
      })

      // 2. Update HarvestLot weight and status
      const newRemainingWeight = Math.max(0, parseFloat((availableWeight - parsedParchmentWeight).toFixed(6)))
      const nextHarvestStatus = newRemainingWeight > 0 ? 'ReadyForProcessing' : 'Complete'

      await tx.harvestLot.update({
        where: { id: harvestLotId },
        data: {
          remainingWeightKg: newRemainingWeight,
          status: nextHarvestStatus,
        },
      })

      // 3. Create ParchmentLot (status: Hulled since we hull immediately)
      const parchmentLot = await tx.parchmentLot.create({
        data: {
          displayId: parchmentDisplayId,
          processingBatchId: batch.id,
          harvestLotId,
          initialWeightKg: parsedParchmentWeight,
          currentWeightKg: 0, // Fully hulled
          moistureContent: parsedMoistureContent,
          processType,
          status: 'Hulled',
        },
      })

      await tx.parchmentWithdrawal.create({
        data: {
          parchmentLotId: parchmentLot.id,
          amountKg: parsedParchmentWeight,
          withdrawalType: 'HullAndGrade',
          purpose: `Immediate hull after ${processType} process`,
          notes: processNotes || null,
          withdrawnBy: user.id,
          withdrawnByName: user.name,
        },
      })

      // 4. Create GreenBeanLot records
      const createdGreenBeans = []
      for (let i = 0; i < gradedLots.length; i++) {
        const gl = gradedLots[i]
        const weight = safeParseFloat(gl.weight)
        const glPrice = safeParseFloat(gl.price)
        const glScore = safeParseFloat(gl.score)

        if (weight === null || weight <= 0) continue

        const greenBean = await tx.greenBeanLot.create({
          data: {
            displayId: greenBeanDisplayIds[i],
            sourceType: 'Internal',
            parchmentLotId: parchmentLot.id,
            grade: gl.grade,
            initialWeightKg: weight,
            currentWeightKg: weight,
            availabilityStatus: 'Available',
            createdById: user.id,
            ...(glPrice !== null && {
              pricePerKg: glPrice,
              currency: 'THB',
            }),
            ...(glScore !== null && {
              processorScore: glScore,
            }),
          },
        })
        createdGreenBeans.push(greenBean)
      }

      return { batch, parchmentLot, greenBeanLots: createdGreenBeans }
    })

    const parchmentLotWithHistory = await prisma.parchmentLot.findUnique({
      where: { id: result.parchmentLot.id },
      include: {
        withdrawalHistory: {
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json(
      {
        processingBatch: result.batch,
        parchmentLot: parchmentLotWithHistory ?? result.parchmentLot,
        greenBeanLots: result.greenBeanLots,
        message: 'Process and hull completed successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
