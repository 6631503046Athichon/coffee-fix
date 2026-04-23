import { NextRequest, NextResponse } from 'next/server'
import { Prisma, SaleOrderStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, validateQuery, createSaleOrderSchema, saleOrderQuerySchema } from '@/lib/validations'
import { getNextSaleOrderNumber, isUniqueConstraintError } from '@/lib/documentNumbers'

// GET /api/sale-orders - List all sale orders
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const queryValidation = validateQuery(request, saleOrderQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.error
    }

    const { customerId, status, search } = queryValidation.data
    const where: Prisma.SaleOrderWhereInput = {}

    if (customerId) {
      where.customerId = customerId
    }

    if (status && (Object.values(SaleOrderStatus) as string[]).includes(status)) {
      where.status = status as SaleOrderStatus
    }

    const normalizedSearch = search?.trim()
    if (normalizedSearch) {
      where.OR = [
        { orderNumber: { contains: normalizedSearch, mode: 'insensitive' } },
        { customerName: { contains: normalizedSearch, mode: 'insensitive' } },
        { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
      ]
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

    const validation = await validateBody(request, createSaleOrderSchema)
    if (!validation.success) {
      return validation.error
    }

    const { customerId, orderDate, status, items, currency, notes } = validation.data

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    const uniqueLotIds = Array.from(new Set(items.map((item) => item.greenBeanLotId)))
    const greenBeanLots = await prisma.greenBeanLot.findMany({
      where: { id: { in: uniqueLotIds } },
      select: { id: true },
    })

    if (greenBeanLots.length !== uniqueLotIds.length) {
      return NextResponse.json(
        { error: 'One or more green bean lots were not found' },
        { status: 400 }
      )
    }

    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0)

    const maxRetries = 5
    let saleOrder: { id: string } | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const orderNumber = await getNextSaleOrderNumber()

      try {
        saleOrder = await prisma.$transaction(async (tx) => {
          const order = await tx.saleOrder.create({
            data: {
              orderNumber,
              customerId,
              customerName: customer.name,
              orderDate: orderDate ? new Date(orderDate) : new Date(),
              status: status || 'Draft',
              totalAmount,
              currency: currency || 'THB',
              notes: notes?.trim() || null,
              createdBy: user.id,
            },
          })

          for (const item of items) {
            await tx.saleOrderItem.create({
              data: {
                saleOrderId: order.id,
                greenBeanLotId: item.greenBeanLotId,
                lotGrade: item.lotGrade,
                quantity: item.quantity,
                pricePerKg: item.pricePerKg,
                subtotal: item.subtotal,
              },
            })
          }

          return order
        })

        break
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < maxRetries - 1) {
          continue
        }
        throw error
      }
    }

    if (!saleOrder) {
      return NextResponse.json(
        { error: 'Unable to generate a unique sale order number. Please try again.' },
        { status: 409 }
      )
    }

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

