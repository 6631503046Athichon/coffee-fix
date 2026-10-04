import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import {
  BODY_NOT_OBJECT_MESSAGE,
  VOID_NOT_EDITABLE_MESSAGE,
  WITHDRAWAL_NOT_FOUND_MESSAGE,
  WithdrawalChangeError,
  parseWithdrawalEdit,
  readJsonObjectBody,
  withdrawalEditData,
} from '@/lib/withdrawalVoid'

// PATCH /api/parchment-lots/:id/withdrawals/:withdrawalId - Correct the sale
// details of a withdrawal: customerName, deliveryAddress, salePrice, currency,
// invoiceNumber. Anything else is 400 (the kg, type, roaster and graded lots
// are fixed: a wrong one is voided and recorded again, see ./void). The total
// is worked out here from the new price. A void withdrawal is 409.
// Same people as recording one: the Processor who created the lot's batch
// (parchmentLot -> processingBatch.createdById), Admin and super admin.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; withdrawalId: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Roaster', 'Admin'])
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited
    const { id, withdrawalId } = await params

    const body = await readJsonObjectBody(request)
    if (!body) {
      return NextResponse.json({ error: BODY_NOT_OBJECT_MESSAGE }, { status: 400 })
    }

    const lot = await prisma.parchmentLot.findUnique({
      where: { id },
      select: { processingBatch: { select: { createdById: true } } },
    })
    if (!lot) {
      return NextResponse.json({ error: 'Parchment lot not found' }, { status: 404 })
    }
    requireOwnership(user, lot.processingBatch?.createdById, ['Admin'])

    const withdrawal = await prisma.parchmentWithdrawal.findUnique({
      where: { id: withdrawalId },
      select: { parchmentLotId: true, withdrawalType: true, amountKg: true, voidedAt: true },
    })
    if (!withdrawal || withdrawal.parchmentLotId !== id) {
      return NextResponse.json({ error: WITHDRAWAL_NOT_FOUND_MESSAGE }, { status: 404 })
    }
    if (withdrawal.voidedAt) {
      return NextResponse.json({ error: VOID_NOT_EDITABLE_MESSAGE }, { status: 409 })
    }

    const edit = parseWithdrawalEdit(body)
    if (!edit.ok) {
      return NextResponse.json({ error: edit.error }, { status: 400 })
    }
    // amountKg and the type never change, so the row read above prices it.
    const data = withdrawalEditData(withdrawal, edit.value)
    if (!data.ok) {
      return NextResponse.json({ error: data.error }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Guarded on not void: a void that lands between the read and here wins.
      const written = await tx.parchmentWithdrawal.updateMany({
        where: { id: withdrawalId, parchmentLotId: id, voidedAt: null },
        data: data.value,
      })
      if (written.count === 0) throw new WithdrawalChangeError(VOID_NOT_EDITABLE_MESSAGE)
      // The row has no updatedAt of its own: touching the lot's tells
      // /api/data-version that pages showing this lot should reload.
      await tx.parchmentLot.update({ where: { id }, data: { updatedAt: new Date() } })
      return tx.parchmentWithdrawal.findUnique({ where: { id: withdrawalId } })
    })

    return NextResponse.json({ withdrawal: updated, message: 'Withdrawal updated' })
  } catch (error) {
    if (error instanceof WithdrawalChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return handleApiError(error)
  }
}
