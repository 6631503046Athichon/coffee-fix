import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/sale-orders - List all sale orders
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: Prisma.SaleOrderWhereInput = {}
    
    // Filter by customerId if provided
    const customerId = request.nextUrl.searchParams.get('customerId')
    if (customerId) {
      where.customerId = customerId
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      where.status = status
    }

    const saleOrders = await prisma.saleOrder.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        items: {
          include: {
            greenBeanLot: {
              select: {
                id: true,
                grade: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { orderDate: 'desc' },
    })

    return NextResponse.json({ saleOrders })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/sale-orders - Create new sale order
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])

    const body = await request.json()
    const { customerId, customerName, orderDate, status, items, currency, notes } = body

    // Validation
    if (!customerId || !customerName || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Customer ID, customer name, and at least one item are required' },
        { status: 400 }
      )
    }

    // Generate order number
    const orderCount = await prisma.saleOrder.count()
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(orderCount + 1).padStart(4, '0')}`

    // Calculate total
    let totalAmount = 0
    for (const item of items) {
      totalAmount += parseFloat(item.subtotal) || (parseFloat(item.quantity) * parseFloat(item.pricePerKg))
    }

    const saleOrder = await prisma.$transaction(async (tx) => {
      // Create order
      const order = await tx.saleOrder.create({
        data: {
          orderNumber,
          customerId,
          customerName,
          orderDate: orderDate ? new Date(orderDate) : new Date(),
          status: status || 'Draft',
          totalAmount,
          currency: currency || 'THB',
          notes: notes || null,
          createdBy: user.id,
        },
      })

      // Create items
      for (const item of items) {
        await tx.saleOrderItem.create({
          data: {
            saleOrderId: order.id,
            greenBeanLotId: item.greenBeanLotId,
            lotGrade: item.lotGrade,
            quantity: parseFloat(item.quantity),
            pricePerKg: parseFloat(item.pricePerKg),
            subtotal: parseFloat(item.subtotal) || (parseFloat(item.quantity) * parseFloat(item.pricePerKg)),
          },
        })
      }

      return order
    })

    const fullOrder = await prisma.saleOrder.findUnique({
      where: { id: saleOrder.id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        items: {
          include: {
            greenBeanLot: {
              select: {
                id: true,
                grade: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(
      { saleOrder: fullOrder, message: 'Sale order created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

