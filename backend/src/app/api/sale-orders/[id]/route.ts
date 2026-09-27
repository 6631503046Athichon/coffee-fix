import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { updateSaleOrderSchema } from '@/lib/validations'
import { parseDateOnly, todayDateOnly } from '@/lib/utils'
import {
  DAY_MS,
  SALE_CHANGED_MESSAGE,
  SALE_NOT_FOUND_MESSAGE,
  SALE_TX_OPTIONS,
  SaleChangedError,
  applyGreenReservationChange,
  applyReservationChange,
  checkSaleBatches,
  checkSaleStock,
  firstIssueMessage,
  priceLines,
  readJsonObject,
  reservationsByBatch,
  reservationsByInventory,
  saleBatchSelect,
  saleErrorResponse,
  saleOrderInclude,
  saleStockSelect,
  serializeSaleOrder,
  type PricedSaleLine,
} from '@/lib/saleOrders'

// What PUT and DELETE need to know about the sale before they change it.
const existingSaleSelect = {
  id: true,
  createdBy: true,
  status: true,
  updatedAt: true,
  customerId: true,
  items: { select: { roastBatchId: true, roasterInventoryId: true, quantity: true } },
} satisfies Prisma.SaleOrderSelect

// GET /api/sale-orders/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Sale orders expose pricing + customer PII.
    // Restrict to Admin and Roaster (the roles that manage sales).
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const saleOrder = await prisma.saleOrder.findUnique({
      where: { id },
      include: saleOrderInclude,
    })

    if (!saleOrder) {
      return NextResponse.json({ error: SALE_NOT_FOUND_MESSAGE }, { status: 404 })
    }

    // SECURITY: Ownership — a Roaster reads only the sales they recorded.
    requireOwnership(user, saleOrder.createdBy, ['Admin'])

    return NextResponse.json({ saleOrder: serializeSaleOrder(saleOrder) })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/sale-orders/:id - Edit a sale: customer, date, currency, notes,
// status, or all of its lines. The roasts' sold kg and the stock rows' green
// kg follow in the same transaction (Cancelled holds nothing).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const body = await readJsonObject(request)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const existing = await prisma.saleOrder.findUnique({
      where: { id },
      select: existingSaleSelect,
    })

    if (!existing) {
      return NextResponse.json({ error: SALE_NOT_FOUND_MESSAGE }, { status: 404 })
    }

    // SECURITY: Ownership — one Roaster cannot edit another Roaster's sale.
    requireOwnership(user, existing.createdBy, ['Admin'])

    // A sellerId in the body is stripped: a sale's owner never changes, so an
    // Admin's edit keeps selling from the owner's roasts and stock.
    const parsed = updateSaleOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    }
    const input = parsed.data

    if (
      input.customerId === undefined &&
      input.orderDate === undefined &&
      input.status === undefined &&
      input.currency === undefined &&
      input.notes === undefined &&
      input.items === undefined
    ) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // A form opened before someone else changed this sale would silently
    // overwrite their change; refuse it so the client can reload first.
    if (
      input.expectedUpdatedAt !== undefined &&
      new Date(input.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()
    ) {
      return NextResponse.json({ error: SALE_CHANGED_MESSAGE }, { status: 409 })
    }

    // Always bump updatedAt: it is the concurrency token for the next edit.
    const header: Prisma.SaleOrderUncheckedUpdateManyInput = { updatedAt: new Date() }

    if (input.orderDate !== undefined) {
      const orderDate = parseDateOnly(input.orderDate) ?? todayDateOnly()
      // A day of slack covers clients ahead of Bangkok time.
      if (orderDate.getTime() > todayDateOnly().getTime() + DAY_MS) {
        return NextResponse.json({ error: 'Sale date cannot be in the future' }, { status: 400 })
      }
      header.orderDate = orderDate
    }
    if (input.status !== undefined) header.status = input.status
    if (input.currency !== undefined) header.currency = input.currency
    if (input.notes !== undefined) header.notes = input.notes?.trim() || null

    if (input.customerId !== undefined && input.customerId !== existing.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true, contactPhone: true, address: true },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      // The receipt shows who the sale went to at the time, so the snapshot
      // moves with the customer.
      header.customerId = customer.id
      header.customerName = customer.name
      header.customerPhone = customer.contactPhone
      header.customerAddress = customer.address
    }

    let newRows: PricedSaleLine[] | null = null
    if (input.items !== undefined) {
      // Older lines have neither a roast nor a stock row, so their kg can't be moved.
      if (existing.items.some((item) => item.roastBatchId == null && item.roasterInventoryId == null)) {
        return NextResponse.json(
          {
            error:
              'This sale was recorded before roast sales and its lines cannot be edited. You can still change its customer, date, status and notes.',
          },
          { status: 409 }
        )
      }

      const batchIds = input.items.flatMap((item) => (item.roastBatchId ? [item.roastBatchId] : []))
      const stockIds = input.items.flatMap((item) => (item.roasterInventoryId ? [item.roasterInventoryId] : []))
      const [batches, stock] = await Promise.all([
        batchIds.length
          ? prisma.roastBatch.findMany({ where: { id: { in: batchIds } }, select: saleBatchSelect })
          : Promise.resolve([]),
        stockIds.length
          ? prisma.roasterInventoryItem.findMany({ where: { id: { in: stockIds } }, select: saleStockSelect })
          : Promise.resolve([]),
      ])
      // Admins too: the roasts and stock rows on a sale always belong to its
      // owner (createdBy), whoever edits it.
      const checked = checkSaleBatches(
        batchIds,
        batches,
        existing.createdBy,
        'Every roast on a sale must come from the roaster who recorded the sale.',
      )
      if ('error' in checked) {
        return NextResponse.json({ error: checked.error.message }, { status: checked.error.status })
      }
      const checkedStock = checkSaleStock(
        stockIds,
        stock,
        existing.createdBy,
        'Every green bean lot on a sale must come from the stock of the roaster who recorded the sale.',
      )
      if ('error' in checkedStock) {
        return NextResponse.json({ error: checkedStock.error.message }, { status: checkedStock.error.status })
      }

      const priced = priceLines(input.items, checked.batchById, checkedStock.stockById)
      newRows = priced.rows
      header.totalAmount = priced.totalAmount
    }

    // One rule covers line edits, status moves (Cancelled holds nothing) and
    // editing a cancelled sale's lines (no stock either way).
    const oldRes = reservationsByBatch(existing.status, existing.items)
    const newRes = reservationsByBatch(input.status ?? existing.status, newRows ?? existing.items)
    const oldGreen = reservationsByInventory(existing.status, existing.items)
    const newGreen = reservationsByInventory(input.status ?? existing.status, newRows ?? existing.items)

    const result = await prisma.$transaction(async (tx) => {
      // First statement: the guarded header update locks the sale row, so the
      // lines read above are still the lines being replaced.
      const updated = await tx.saleOrder.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: header,
      })
      if (updated.count === 0) {
        throw new SaleChangedError()
      }

      if (newRows) {
        await tx.saleOrderItem.deleteMany({ where: { saleOrderId: id } })
        const t0 = Date.now()
        await tx.saleOrderItem.createMany({
          data: newRows.map((row, i) => ({ ...row, saleOrderId: id, createdAt: new Date(t0 + i) })),
        })
      }

      // Roasts first, then stock rows: the same lock order as every other sale write.
      const affected = await applyReservationChange(tx, oldRes, newRes)
      const affectedInventory = await applyGreenReservationChange(tx, oldGreen, newGreen, existing.createdBy)

      const saleOrder = await tx.saleOrder.findUnique({
        where: { id },
        include: saleOrderInclude,
      })
      if (!saleOrder) {
        throw new SaleChangedError()
      }
      return { saleOrder, affected, affectedInventory }
    }, SALE_TX_OPTIONS)

    return NextResponse.json({
      saleOrder: serializeSaleOrder(result.saleOrder),
      affectedRoastBatches: result.affected,
      affectedInventoryItems: result.affectedInventory,
      message: 'Sale updated',
    })
  } catch (error) {
    const mapped = saleErrorResponse(error)
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    return handleApiError(error)
  }
}

// DELETE /api/sale-orders/:id - Remove a sale. Its kg go back to the roasts
// and stock rows (none for a cancelled sale) and its invoices go with it.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const existing = await prisma.saleOrder.findUnique({
      where: { id },
      select: existingSaleSelect,
    })

    if (!existing) {
      return NextResponse.json({ error: SALE_NOT_FOUND_MESSAGE }, { status: 404 })
    }

    // SECURITY: Ownership — one Roaster cannot delete another Roaster's sale.
    requireOwnership(user, existing.createdBy, ['Admin'])

    const expectedUpdatedAt = request.nextUrl.searchParams.get('expectedUpdatedAt')
    if (expectedUpdatedAt !== null) {
      const expected = new Date(expectedUpdatedAt).getTime()
      if (Number.isNaN(expected)) {
        return NextResponse.json({ error: 'Invalid expectedUpdatedAt' }, { status: 400 })
      }
      if (expected !== existing.updatedAt.getTime()) {
        return NextResponse.json({ error: SALE_CHANGED_MESSAGE }, { status: 409 })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Invoice.saleOrder is Restrict, so the invoices go first (their lines
      // cascade). A failed guard below rolls this back.
      const invoices = await tx.invoice.deleteMany({ where: { saleOrderId: id } })

      const deleted = await tx.saleOrder.deleteMany({
        where: { id, updatedAt: existing.updatedAt },
      })
      if (deleted.count === 0) {
        throw new SaleChangedError()
      }

      const affected = await applyReservationChange(
        tx,
        reservationsByBatch(existing.status, existing.items),
        new Map(),
      )
      const affectedInventory = await applyGreenReservationChange(
        tx,
        reservationsByInventory(existing.status, existing.items),
        new Map(),
        existing.createdBy,
      )
      return { deletedInvoices: invoices.count, affected, affectedInventory }
    }, SALE_TX_OPTIONS)

    return NextResponse.json({
      message: 'Sale deleted',
      affectedRoastBatches: result.affected,
      affectedInventoryItems: result.affectedInventory,
      deletedInvoices: result.deletedInvoices,
    })
  } catch (error) {
    // P2003 here means an invoice was created in between.
    const mapped = saleErrorResponse(error, SALE_CHANGED_MESSAGE)
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    return handleApiError(error)
  }
}
