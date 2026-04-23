import { NextRequest, NextResponse } from 'next/server'
import { Prisma, InvoiceStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, validateQuery, createInvoiceSchema, invoiceQuerySchema } from '@/lib/validations'
import { getNextInvoiceNumber, isUniqueConstraintError } from '@/lib/documentNumbers'

// GET /api/invoices - List all invoices
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const queryValidation = validateQuery(request, invoiceQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.error
    }

    const { saleOrderId, status, search } = queryValidation.data
    const where: Prisma.InvoiceWhereInput = {}

    if (saleOrderId) {
      where.saleOrderId = saleOrderId
    }

    if (status && (Object.values(InvoiceStatus) as string[]).includes(status)) {
      where.status = status as InvoiceStatus
    }

    const normalizedSearch = search?.trim()
    if (normalizedSearch) {
      where.OR = [
        { invoiceNumber: { contains: normalizedSearch, mode: 'insensitive' } },
        { saleOrder: { orderNumber: { contains: normalizedSearch, mode: 'insensitive' } } },
        { saleOrder: { customerName: { contains: normalizedSearch, mode: 'insensitive' } } },
      ]
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

    const validation = await validateBody(request, createInvoiceSchema)
    if (!validation.success) {
      return validation.error
    }

    const { saleOrderId, issueDate, dueDate, status, tax, currency, notes } = validation.data

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

    if (saleOrder.items.length === 0) {
      return NextResponse.json(
        { error: 'Cannot create an invoice from a sale order with no items' },
        { status: 400 }
      )
    }

    const issueDateValue = issueDate ? new Date(issueDate) : new Date()
    const dueDateValue = dueDate ? new Date(dueDate) : null

    if (dueDateValue && dueDateValue < issueDateValue) {
      return NextResponse.json(
        { error: 'Due date cannot be earlier than the issue date' },
        { status: 400 }
      )
    }

    const subtotal = saleOrder.totalAmount
    const taxAmount = tax ?? 0
    const totalAmount = subtotal + taxAmount

    const maxRetries = 5
    let invoice: { id: string } | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const invoiceNumber = await getNextInvoiceNumber()

      try {
        invoice = await prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              invoiceNumber,
              saleOrderId,
              issueDate: issueDateValue,
              dueDate: dueDateValue,
              status: status || 'Draft',
              subtotal,
              tax: taxAmount > 0 ? taxAmount : null,
              totalAmount,
              currency: currency || saleOrder.currency,
              notes: notes?.trim() || null,
              createdBy: user.id,
            },
          })

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

        break
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < maxRetries - 1) {
          continue
        }
        throw error
      }
    }

    if (!invoice) {
      return NextResponse.json(
        { error: 'Unable to generate a unique invoice number. Please try again.' },
        { status: 409 }
      )
    }

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

