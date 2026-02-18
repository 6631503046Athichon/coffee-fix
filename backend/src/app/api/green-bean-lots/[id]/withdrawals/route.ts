import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// DELETE /api/green-bean-lots/:id/withdrawals?withdrawalId=xxx - Delete withdrawal and reverse weight
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const withdrawalId = request.nextUrl.searchParams.get('withdrawalId')

    if (!withdrawalId) {
      return NextResponse.json(
        { error: 'withdrawalId query parameter is required' },
        { status: 400 }
      )
    }

    // Get the withdrawal
    const withdrawal = await prisma.greenBeanWithdrawal.findUnique({
      where: { id: withdrawalId },
    })

    if (!withdrawal || withdrawal.greenBeanLotId !== id) {
      return NextResponse.json(
        { error: 'Withdrawal not found for this lot' },
        { status: 404 }
      )
    }

    await prisma.$transaction(async (tx) => {
      // Return the weight to the original lot
      const lot = await tx.greenBeanLot.findUnique({ where: { id } })
      if (!lot) throw new Error('Lot not found')

      const newWeight = lot.currentWeightKg + withdrawal.amountKg

      await tx.greenBeanLot.update({
        where: { id },
        data: {
          currentWeightKg: newWeight,
          availabilityStatus: newWeight > 0 ? 'Available' : 'Withdrawn',
        },
      })

      // Delete any RB lot that was created from this withdrawal (match by parentLotId and weight)
      // Find RB lots that reference this lot
      const rbLots = await tx.greenBeanLot.findMany({
        where: {
          lotId: { startsWith: 'RB-' },
          externalSource: { path: ['parentLotId'], equals: id },
        },
      })

      // Delete the RB lot matching this withdrawal's amount (best match)
      for (const rbLot of rbLots) {
        if (rbLot.initialWeightKg === withdrawal.amountKg) {
          await tx.greenBeanLot.delete({ where: { id: rbLot.id } })
          console.log(`[DeleteWithdrawal] Deleted RB lot ${rbLot.lotId}`)
          break
        }
      }

      // Delete the withdrawal record
      await tx.greenBeanWithdrawal.delete({
        where: { id: withdrawalId },
      })

      console.log(`[DeleteWithdrawal] Reversed ${withdrawal.amountKg} kg to lot ${id}`)
    })

    // Return updated lot
    const updatedLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        withdrawalHistory: {
          include: {
            withdrawnByUser: {
              select: { id: true, name: true },
            },
          },
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json(
      { greenBeanLot: updatedLot, message: 'Withdrawal deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/green-bean-lots/:id/withdrawals - Create withdrawal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { amountKg, withdrawalType, purpose, notes, salePrice, currency, customerName, invoiceNumber, deliveryAddress } = body

    if (!amountKg || !withdrawalType || !purpose) {
      return NextResponse.json(
        { error: 'Amount, withdrawal type, and purpose are required' },
        { status: 400 }
      )
    }

    // Get current lot
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    if (parseFloat(amountKg) > lot.currentWeightKg) {
      return NextResponse.json(
        { error: 'Insufficient weight available' },
        { status: 400 }
      )
    }

    // Calculate total amount for sales
    const totalAmount = withdrawalType === 'Sale' && salePrice
      ? parseFloat(amountKg) * parseFloat(salePrice)
      : null

    const withdrawnAmount = parseFloat(amountKg)
    const newWeight = lot.currentWeightKg - withdrawnAmount

    await prisma.$transaction(async (tx) => {
      // Create withdrawal
      await tx.greenBeanWithdrawal.create({
        data: {
          greenBeanLotId: id,
          amountKg: withdrawnAmount,
          withdrawalType,
          purpose,
          notes: notes || null,
          withdrawnBy: user.id,
          withdrawnByName: user.name,
          salePrice: salePrice ? parseFloat(salePrice) : null,
          currency: currency || null,
          customerName: customerName || null,
          invoiceNumber: invoiceNumber || null,
          deliveryAddress: deliveryAddress || null,
          totalAmount,
        },
      })

      // Update lot weight and status
      await tx.greenBeanLot.update({
        where: { id },
        data: {
          currentWeightKg: newWeight,
          availabilityStatus: newWeight <= 0 ? 'Withdrawn' : 'Available',
        },
      })

      // Create a NEW GreenBeanLot (RB-XXX) for every withdrawal
      // so it appears in Internal Lots for the Roaster to claim
      {
        // Generate next RB-XXX ID
        const allRbLots = await tx.greenBeanLot.findMany({
          select: { lotId: true },
          where: { lotId: { startsWith: 'RB-' } },
        })
        let maxRb = 0
        allRbLots.forEach((l: { lotId: string | null }) => {
          if (l.lotId) {
            const match = l.lotId.match(/RB-(\d+)/)
            if (match) {
              const num = parseInt(match[1], 10)
              if (num > maxRb) maxRb = num
            }
          }
        })
        const rbLotId = `RB-${String(maxRb + 1).padStart(3, '0')}`

        // Create a new GreenBeanLot representing the withdrawn portion
        // Copy traceability info from the original lot
        await tx.greenBeanLot.create({
          data: {
            lotId: rbLotId,
            sourceType: 'Internal',
            parchmentLotId: lot.parchmentLotId,
            grade: lot.grade,
            initialWeightKg: withdrawnAmount,
            currentWeightKg: withdrawnAmount,
            availabilityStatus: 'Available',
            processorScore: lot.processorScore,
            createdById: user.id,
            // Store original lot reference in externalSource JSON
            externalSource: { parentLotId: id, parentLotCode: lot.lotId },
          },
        })
        console.log(`[Withdrawal] Created RB lot ${rbLotId} (${withdrawnAmount} kg) from lot ${lot.lotId}`)
      }
    })

    const updatedLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
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
      },
    })

    return NextResponse.json(
      { greenBeanLot: updatedLot, message: 'Withdrawal created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
