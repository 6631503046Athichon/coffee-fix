import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateQuery, createSaleOrderSchema, saleOrderQuerySchema } from '@/lib/validations'
import { getNextSaleOrderNumber, isUniqueConstraintError } from '@/lib/documentNumbers'
import { parseDateOnly, todayDateOnly } from '@/lib/utils'
import {
  DAY_MS,
  MAX_ORDER_NUMBER_ATTEMPTS,
  SALE_TX_OPTIONS,
  applyReservationChange,
  canSeeSales,
  checkSaleBatches,
  firstIssueMessage,
  isAdminUser,
  priceLines,
  readJsonObject,
  reservationsByBatch,
  saleBatchSelect,
  saleErrorResponse,
  saleOrderInclude,
  serializeSaleOrder,
  type AffectedRoastBatchJson,
  type SaleOrderRow,
} from '@/lib/saleOrders'

// GET /api/sale-orders - The sales log
// Roasters see only the sales they recorded; Admins see every sale. Other
// roles get an empty list (not 403) so an old tab's refresh loop stays healthy.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    if (!canSeeSales(user)) {
      return NextResponse.json({ saleOrders: [] })
    }

    const queryValidation = validateQuery(request, saleOrderQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.error
    }

    const { customerId, status, search, startDate, endDate } = queryValidation.data
    // The owner scope sits in AND, so the search OR below can never widen it.
    const and: Prisma.SaleOrderWhereInput[] = []

    if (!isAdminUser(user)) {
      and.push({ createdBy: user.id })
    }

    if (customerId) {
      and.push({ customerId })
    }

    if (status) {
      and.push({ status })
    }

    const normalizedSearch = search?.trim()
    if (normalizedSearch) {
      and.push({
        OR: [
          { orderNumber: { contains: normalizedSearch, mode: 'insensitive' } },
          { customerName: { contains: normalizedSearch, mode: 'insensitive' } },
          { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
        ],
      })
    }

    // Sale dates are stored at 12:00Z, so whole UTC days cover them.
    if (startDate) {
      and.push({ orderDate: { gte: new Date(`${startDate}T00:00:00.000Z`) } })
    }

    if (endDate) {
      and.push({ orderDate: { lt: new Date(new Date(`${endDate}T00:00:00.000Z`).getTime() + DAY_MS) } })
    }

    const saleOrders = await prisma.saleOrder.findMany({
      where: { AND: and },
      include: saleOrderInclude,
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ saleOrders: saleOrders.map(serializeSaleOrder) })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/sale-orders - Record a sale of roasted coffee
// Every line comes from one of the seller's own roasts. Amounts are priced
// here, and the roasts' sold kg move in the same transaction as the sale.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])

    const body = await readJsonObject(request)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = createSaleOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    }
    const input = parsed.data

    const orderDate = parseDateOnly(input.orderDate) ?? todayDateOnly()
    // A day of slack covers clients ahead of Bangkok time.
    if (orderDate.getTime() > todayDateOnly().getTime() + DAY_MS) {
      return NextResponse.json({ error: 'Sale date cannot be in the future' }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true, contactPhone: true, address: true },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const batchIds = input.items.map((item) => item.roastBatchId)
    const batches = await prisma.roastBatch.findMany({
      where: { id: { in: batchIds } },
      select: saleBatchSelect,
    })
    // Admins too: nobody sells another roaster's coffee in their own name.
    const checked = checkSaleBatches(
      batchIds,
      batches,
      user.id,
      'You can only sell roasts from your own Roast Logbook.',
    )
    if ('error' in checked) {
      return NextResponse.json({ error: checked.error.message }, { status: checked.error.status })
    }

    const { rows, totalAmount } = priceLines(input.items, checked.batchById)
    const status = input.status ?? 'Confirmed'

    let result: { saleOrder: SaleOrderRow; affected: AffectedRoastBatchJson[] } | null = null

    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      const orderNumber = await getNextSaleOrderNumber()

      try {
        result = await prisma.$transaction(async (tx) => {
          const order = await tx.saleOrder.create({
            data: {
              orderNumber,
              customerId: customer.id,
              customerName: customer.name,
              customerPhone: customer.contactPhone,
              customerAddress: customer.address,
              orderDate,
              status,
              totalAmount,
              currency: input.currency ?? 'THB',
              notes: input.notes?.trim() || null,
              createdBy: user.id,
            },
            select: { id: true },
          })

          // Spaced createdAt keeps the lines in the order they were entered.
          const t0 = Date.now()
          await tx.saleOrderItem.createMany({
            data: rows.map((row, i) => ({ ...row, saleOrderId: order.id, createdAt: new Date(t0 + i) })),
          })

          const affected = await applyReservationChange(tx, new Map(), reservationsByBatch(status, rows))

          // Read back inside the transaction: api.ts retries any 503, so a
          // 503 must only ever come from an attempt that rolled back.
          const saleOrder = await tx.saleOrder.findUnique({
            where: { id: order.id },
            include: saleOrderInclude,
          })
          if (!saleOrder) {
            throw new Error('Sale vanished while it was being recorded')
          }
          return { saleOrder, affected }
        }, SALE_TX_OPTIONS)

        break
      } catch (error) {
        // Another sale took this number first; read the next one and retry.
        if (isUniqueConstraintError(error)) {
          continue
        }
        throw error
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Unable to generate a unique sale order number. Please try again.' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      {
        saleOrder: serializeSaleOrder(result.saleOrder),
        affectedRoastBatches: result.affected,
        message: 'Sale recorded',
      },
      { status: 201 }
    )
  } catch (error) {
    const mapped = saleErrorResponse(error)
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    return handleApiError(error)
  }
}
