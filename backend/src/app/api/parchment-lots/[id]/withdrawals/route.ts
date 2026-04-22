import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat, nextDisplayId } from '@/lib/utils'

// POST /api/parchment-lots/:id/withdrawals - Create withdrawal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Roaster', 'Admin'])
    const { id } = await params

    const body = await request.json()
    const {
      amountKg, withdrawalType, purpose, notes,
      salePrice, currency, customerName, deliveryAddress,
      targetRoasterId, roastProfileNotes, cuppingScore,
      gradedLots, totalGreenBeanWeight,
    } = body

    if (!amountKg || !withdrawalType || !purpose) {
      return NextResponse.json(
        { error: 'Amount, withdrawal type, and purpose are required' },
        { status: 400 }
      )
    }

    // Get current lot
    const lot = await prisma.parchmentLot.findUnique({
      where: { id },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    const amount = safeParseFloat(amountKg)
    if (amount === null || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    if (amount > lot.currentWeightKg) {
      return NextResponse.json(
        { error: 'Insufficient weight available' },
        { status: 400 }
      )
    }

    // Validate HullAndGrade specific fields
    if (withdrawalType === 'HullAndGrade') {
      if (!gradedLots || !Array.isArray(gradedLots) || gradedLots.length === 0) {
        return NextResponse.json(
          { error: 'Graded lots are required for Hull & Grade withdrawal' },
          { status: 400 }
        )
      }
    }

    // Calculate total amount for sales
    const price = safeParseFloat(salePrice)
    const totalAmount = withdrawalType === 'Sale' && price !== null
      ? amount * price
      : null

    // Pre-generate display IDs for green bean lots if HullAndGrade
    let greenBeanDisplayIds: string[] = []
    if (withdrawalType === 'HullAndGrade' && gradedLots) {
      for (let i = 0; i < gradedLots.length; i++) {
        const displayId = await nextDisplayId(prisma.greenBeanLot, 'GB')
        greenBeanDisplayIds.push(displayId)
      }
    }

    await prisma.$transaction(async (tx) => {
      // Create withdrawal record
      await tx.parchmentWithdrawal.create({
        data: {
          parchmentLotId: id,
          amountKg: amount,
          withdrawalType,
          purpose,
          notes: notes || null,
          withdrawnBy: user.id,
          withdrawnByName: user.name,
          salePrice: price,
          currency: currency || null,
          customerName: customerName || null,
          deliveryAddress: deliveryAddress || null,
          totalAmount,
          targetRoasterId: targetRoasterId || null,
          roastProfileNotes: roastProfileNotes || null,
          cuppingScore: safeParseFloat(cuppingScore),
        },
      })

      // Update lot weight
      const newWeight = Math.max(0, parseFloat((lot.currentWeightKg - amount).toFixed(6)))
      const updateData: any = {
        currentWeightKg: newWeight,
      }

      // If HullAndGrade and weight is depleted, mark as Hulled
      if (withdrawalType === 'HullAndGrade' && newWeight <= 0) {
        updateData.status = 'Hulled'
      }

      await tx.parchmentLot.update({
        where: { id },
        data: updateData,
      })

      // If HullAndGrade, create green bean lots
      if (withdrawalType === 'HullAndGrade' && gradedLots) {
        for (let i = 0; i < gradedLots.length; i++) {
          const gl = gradedLots[i]
          const weight = safeParseFloat(gl.weight)
          const glPrice = safeParseFloat(gl.price)
          const glScore = safeParseFloat(gl.score)

          if (weight === null || weight <= 0) continue

          await tx.greenBeanLot.create({
            data: {
              displayId: greenBeanDisplayIds[i],
              sourceType: 'Internal',
              parchmentLotId: id,
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
        }
      }

      // For RoastingStock with target roaster, create/update inventory
      if (targetRoasterId && (withdrawalType === 'RoastingStock')) {
        // Note: For parchment roasting stock, we don't create RoasterInventoryItem
        // since that requires a greenBeanLotId. The roast profile notes and cupping
        // score are stored in the withdrawal record itself.
      }
    })

    const updatedLot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        withdrawalHistory: {
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json(
      {
        parchmentLot: updatedLot,
        message: 'Withdrawal created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
