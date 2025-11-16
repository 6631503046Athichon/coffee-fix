import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/pricing-history - List all pricing history
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}
    
    // Filter by greenBeanLotId if provided
    const greenBeanLotId = request.nextUrl.searchParams.get('greenBeanLotId')
    if (greenBeanLotId) {
      where.greenBeanLotId = greenBeanLotId
    }

    const pricingHistory = await prisma.pricingHistory.findMany({
      where,
      include: {
        greenBeanLot: {
          select: {
            id: true,
            grade: true,
          },
        },
        setter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { effectiveDate: 'desc' },
    })

    return NextResponse.json({ pricingHistory })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/pricing-history - Create new pricing history entry
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const body = await request.json()
    const { greenBeanLotId, pricePerKg, currency, effectiveDate, notes } = body

    // Validation
    if (!greenBeanLotId || !pricePerKg || !currency) {
      return NextResponse.json(
        { error: 'Green bean lot ID, price per kg, and currency are required' },
        { status: 400 }
      )
    }

    const pricingHistory = await prisma.pricingHistory.create({
      data: {
        greenBeanLotId,
        pricePerKg: parseFloat(pricePerKg),
        currency,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        setBy: user.id,
        notes: notes || null,
      },
      include: {
        greenBeanLot: {
          select: {
            id: true,
            grade: true,
          },
        },
        setter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Update green bean lot price
    await prisma.greenBeanLot.update({
      where: { id: greenBeanLotId },
      data: {
        pricePerKg: parseFloat(pricePerKg),
        currency,
        priceSetDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        priceSetBy: user.id,
      },
    })

    return NextResponse.json(
      { pricingHistory, message: 'Pricing history created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

