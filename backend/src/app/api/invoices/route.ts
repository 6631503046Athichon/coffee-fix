import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/invoices - List all invoices
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}
    
    // Filter by saleOrderId if provided
    const saleOrderId = request.nextUrl.searchParams.get('saleOrderId')
    if (saleOrderId) {
      where.saleOrderId = saleOrderId
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      where.status = status
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        saleOrder: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
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
      orderBy: { issueDate: 'desc' },
    })

    return NextResponse.json({ invoices })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/invoices - Create new invoice
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])

    const body = await request.json()
    const { saleOrderId, issueDate, dueDate, status, tax, currency, notes } = body

    // Validation
    if (!saleOrderId) {
      return NextResponse.json(
        { error: 'Sale order ID is required' },
        { status: 400 }
      )
    }

    // Get sale order
    const saleOrder = await prisma.saleOrder.findUnique({
      where: { id: saleOrderId },
      include: {
        items: true,
      },
    })

    if (!saleOrder) {
      return NextResponse.json(
        { error: 'Sale order not found' },
        { status: 404 }
      )
    }

    // Generate invoice number
    const invoiceCount = await prisma.invoice.count()
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(4, '0')}`

    const subtotal = saleOrder.totalAmount
    const taxAmount = tax ? parseFloat(tax) : 0
    const totalAmount = subtotal + taxAmount

    const invoice = await prisma.$transaction(async (tx) => {
      // Create invoice
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          saleOrderId,
          issueDate: issueDate ? new Date(issueDate) : new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,
          status: status || 'Draft',
          subtotal,
          tax: taxAmount > 0 ? taxAmount : null,
          totalAmount,
          currency: currency || saleOrder.currency,
          notes: notes || null,
          createdBy: user.id,
        },
      })

      // Create invoice items from sale order items
      for (const item of saleOrder.items) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            greenBeanLotId: item.greenBeanLotId,
            lotGrade: item.lotGrade,
            quantity: item.quantity,
            pricePerKg: item.pricePerKg,
            subtotal: item.subtotal,
          },
        })
      }

      return inv
    })

    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        saleOrder: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
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
      { invoice: fullInvoice, message: 'Invoice created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

