import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// POST /api/green-bean-lots/:id/withdrawals - Create withdrawal
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)

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
      where: { id: params.id },
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

    await prisma.$transaction(async (tx) => {
      // Create withdrawal
      await tx.greenBeanWithdrawal.create({
        data: {
          greenBeanLotId: params.id,
          amountKg: parseFloat(amountKg),
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

      // Update lot weight
      await tx.greenBeanLot.update({
        where: { id: params.id },
        data: {
          currentWeightKg: lot.currentWeightKg - parseFloat(amountKg),
        },
      })
    })

    const updatedLot = await prisma.greenBeanLot.findUnique({
      where: { id: params.id },
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

