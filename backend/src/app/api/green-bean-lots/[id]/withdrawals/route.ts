import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'

// POST /api/green-bean-lots/:id/withdrawals - Create withdrawal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor, Roaster, and Admin can create withdrawals
    requireRole(user, ['Processor', 'Roaster', 'Admin'])
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

    const amount = safeParseFloat(amountKg);
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

    // Calculate total amount for sales
    const price = safeParseFloat(salePrice);
    const totalAmount = withdrawalType === 'Sale' && price !== null
      ? amount * price
      : null

    await prisma.$transaction(async (tx) => {
      // Create withdrawal
      await tx.greenBeanWithdrawal.create({
        data: {
          greenBeanLotId: id,
          amountKg: amount,
          withdrawalType,
          purpose,
          notes: notes || null,
          withdrawnBy: user.id,
          withdrawnByName: user.name,
          salePrice: price,
          currency: currency || null,
          customerName: customerName || null,
          invoiceNumber: invoiceNumber || null,
          deliveryAddress: deliveryAddress || null,
          totalAmount,
        },
      })

      // Update lot weight
      await tx.greenBeanLot.update({
        where: { id },
        data: {
          currentWeightKg: lot.currentWeightKg - amount,
        },
      })
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
