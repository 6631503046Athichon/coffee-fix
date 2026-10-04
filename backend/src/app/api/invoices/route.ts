import { NextRequest, NextResponse } from 'next/server'
import { Prisma, InvoiceStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { validateBody, validateQuery, createInvoiceSchema, invoiceQuerySchema } from '@/lib/validations'
import { getNextInvoiceNumber, isUniqueConstraintError } from '@/lib/documentNumbers'
import { MAX_ORDER_NUMBER_ATTEMPTS, canSeeSales, isAdminUser } from '@/lib/saleOrders'
import { parseStrictDateOnly, todayDateOnly } from '@/lib/utils'

// GET /api/invoices - List invoices
// Roasters see only invoices on the sales they recorded; Admins see every
// invoice. Other roles get an empty list (not 403) so an old tab's refresh
// loop stays healthy.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!canSeeSales(user)) {
      return NextResponse.json({ invoices: [] })
    }

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

    // The owner scope sits in AND, so the search OR below can never widen it.
    if (!isAdminUser(user)) {
      where.AND = [{ saleOrder: { createdBy: user.id } }]
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
      // A defaulted issue date is the Thai day at 12:00 UTC, so every invoice
      // made that day shares one value: createdAt keeps them newest first.
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
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

    // SECURITY: Ownership — a Roaster invoices only the sales they recorded.
    requireOwnership(user, saleOrder.createdBy, ['Admin'])

    if (saleOrder.status === 'Cancelled') {
      return NextResponse.json(
        { error: 'A cancelled sale cannot be invoiced' },
        { status: 409 }
      )
    }

    if (saleOrder.items.length === 0) {
      return NextResponse.json(
        { error: 'Cannot create an invoice from a sale order with no items' },
        { status: 400 }
      )
    }

    // Issue and due dates are calendar days: a picked YYYY-MM-DD is stored at
    // 12:00 UTC (parseDateOnly's anchor), so it reads as the same day in
    // every timezone, and no issue date means the Thai today, not the UTC
    // instant (which is still yesterday until 07:00 Thai time).
    const issueDateValue = parseStrictDateOnly(issueDate) ?? todayDateOnly()
    const dueDateValue = parseStrictDateOnly(dueDate)

    if (
      Number.isNaN(issueDateValue.getTime()) ||
      (dueDateValue && Number.isNaN(dueDateValue.getTime()))
    ) {
      return NextResponse.json(
        { error: 'Issue and due dates must be real calendar dates' },
        { status: 400 }
      )
    }

    // Compared as Thai calendar days, so a due date on the issue day passes.
    if (dueDateValue && todayDateOnly(dueDateValue) < todayDateOnly(issueDateValue)) {
      return NextResponse.json(
        { error: 'Due date cannot be earlier than the issue date' },
        { status: 400 }
      )
    }

    const subtotal = saleOrder.totalAmount
    const taxAmount = tax ?? 0
    const totalAmount = subtotal + taxAmount

    let invoice: { id: string } | null = null

    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      try {
        invoice = await prisma.$transaction(async (tx) => {
          // Taken first, inside the transaction: an invoice that fails gives
          // its number back, and a deleted invoice's number is never handed
          // out again (lib/documentSequence).
          const invoiceNumber = await getNextInvoiceNumber(undefined, tx)
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
        // The number is already on an invoice (one recorded without the
        // counter): the next attempt takes the next number. After the last
        // attempt the 409 below answers.
        if (isUniqueConstraintError(error)) {
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

