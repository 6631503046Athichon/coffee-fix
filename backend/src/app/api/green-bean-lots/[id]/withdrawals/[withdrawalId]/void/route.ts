import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { SALE_TX_OPTIONS, WEIGHT_EPSILON, formatKgText, type SaleTx } from '@/lib/saleOrders'
import {
  ALREADY_VOID_MESSAGE,
  BODY_NOT_OBJECT_MESSAGE,
  WITHDRAWAL_NOT_FOUND_MESSAGE,
  WithdrawalChangeError,
  lotOverfillMessage,
  parseVoidBody,
  readJsonObjectBody,
  round6,
  wouldOverfill,
} from '@/lib/withdrawalVoid'
import { EMPTY_ROASTER_STOCK_WHERE } from '@/lib/greenLotRemoval'

type VoidedWithdrawal = {
  id: string
  amountKg: number
  withdrawalType: string
  targetRoasterId: string | null
  createdAt: Date
}

// The push makes or fills the roaster's stock row in the transaction that
// records the withdrawal, which cannot run longer than this.
const PUSH_ROW_SLACK_MS = SALE_TX_OPTIONS.timeout

/**
 * The roaster whose stock the withdrawal filled, or null when it filled none.
 * Withdrawals since prisma/sql/005 record it. An older Roasting Stock one
 * (the only type the Workbench sends a roaster with) does not: its kg sit in
 * the one roaster stock row this lot has, and with several (or none) there is
 * no telling whose, so the void is refused rather than guessed. So is it when
 * that one row was started after the push: the roaster pushed to is gone (a
 * user delete takes their stock rows) and a later claim made this one, so it
 * never held these kg.
 */
async function roasterToTakeBackFrom(tx: SaleTx, lotId: string, withdrawal: VoidedWithdrawal) {
  if (withdrawal.targetRoasterId) return withdrawal.targetRoasterId
  if (withdrawal.withdrawalType !== 'RoastingStock') return null
  const rows = await tx.roasterInventoryItem.findMany({
    where: { greenBeanLotId: lotId },
    select: { roasterId: true, createdAt: true },
  })
  if (rows.length === 1) {
    if (rows[0].createdAt.getTime() <= withdrawal.createdAt.getTime() + PUSH_ROW_SLACK_MS) {
      return rows[0].roasterId
    }
    throw new WithdrawalChangeError(
      `This withdrawal was recorded before the roaster was saved on it, and the only roaster stock of this lot was started after it, so it does not hold the ${formatKgText(withdrawal.amountKg)} kg this withdrawal sent. Ask the roaster to lower their claim instead.`,
    )
  }
  throw new WithdrawalChangeError(
    rows.length === 0
      ? `No roaster holds stock from this lot any more, so the ${formatKgText(withdrawal.amountKg)} kg this withdrawal sent cannot be taken back.`
      : `This withdrawal was recorded before the roaster was saved on it, and ${rows.length} roasters hold stock from this lot, so it cannot tell whose stock the ${formatKgText(withdrawal.amountKg)} kg are in. Ask the roaster to lower their claim instead.`,
  )
}

/**
 * Takes the withdrawal's kg back off the roaster's stock row: off the claim
 * and off the shelf (remainingWeightKg), which must still hold all of them.
 * Roasts and green-bean sales take their kg off the shelf, so kg the roaster
 * already used cannot come back, and the void is refused instead.
 * A row left holding nothing is removed by removeIfEmpty, below.
 */
async function takeBackFromRoaster(tx: SaleTx, lotId: string, roasterId: string, kg: number) {
  const item = await tx.roasterInventoryItem.findUnique({
    where: { roasterId_greenBeanLotId: { roasterId, greenBeanLotId: lotId } },
    select: { id: true },
  })
  if (!item) {
    throw new WithdrawalChangeError(
      `The roaster's stock of this lot is gone, so the ${formatKgText(kg)} kg this withdrawal sent cannot be taken back.`,
    )
  }
  // After the lot, as in a claim, a withdrawal and a stock correction.
  await tx.$queryRaw`SELECT "id" FROM "RoasterInventoryItem" WHERE "id" = ${item.id} FOR NO KEY UPDATE`
  const fresh = await tx.roasterInventoryItem.findUnique({
    where: { id: item.id },
    select: { claimedWeightKg: true, remainingWeightKg: true, roaster: { select: { name: true } } },
  })
  if (!fresh) {
    throw new WithdrawalChangeError(
      `The roaster's stock of this lot is gone, so the ${formatKgText(kg)} kg this withdrawal sent cannot be taken back.`,
    )
  }
  if (fresh.remainingWeightKg + WEIGHT_EPSILON < kg || fresh.claimedWeightKg + WEIGHT_EPSILON < kg) {
    const left = Math.max(0, Math.min(fresh.remainingWeightKg, fresh.claimedWeightKg))
    throw new WithdrawalChangeError(
      `${fresh.roaster?.name ?? 'The roaster'} already used these kg: only ${formatKgText(left)} of the ` +
        `${formatKgText(kg)} kg sent are still in their stock (roasts or sales took the rest), so this withdrawal cannot be voided.`,
    )
  }
  const settle = (value: number) => {
    const next = round6(value - kg)
    return next <= WEIGHT_EPSILON ? 0 : next
  }
  return tx.roasterInventoryItem.update({
    where: { id: item.id },
    data: {
      claimedWeightKg: settle(fresh.claimedWeightKg),
      remainingWeightKg: settle(fresh.remainingWeightKg),
    },
    select: { id: true, roasterId: true, greenBeanLotId: true, claimedWeightKg: true, remainingWeightKg: true },
  })
}

/**
 * Removes the roaster's stock row when the void left it holding nothing: 0 kg
 * claimed and on the shelf, with no roast or sale pointing at it (the push
 * made it and this takes it back). Left behind, it would keep the lot from
 * ever being deleted. A row the roaster also claimed into, or roasted or sold
 * from, stays. Runs under the row lock takeBackFromRoaster took.
 */
async function removeIfEmpty(tx: SaleTx, itemId: string): Promise<boolean> {
  const { count } = await tx.roasterInventoryItem.deleteMany({
    where: { id: itemId, ...EMPTY_ROASTER_STOCK_WHERE },
  })
  return count > 0
}

/**
 * Puts `kg` back on the lot. The withdrawal route marks a lot it empties
 * Withdrawn, so a lot at 0 kg becomes Available again; a lot its owner took
 * off the market while it still held kg keeps its status.
 */
async function restoreLot(tx: SaleTx, lotId: string, kg: number) {
  const lot = await tx.greenBeanLot.findUnique({
    where: { id: lotId },
    select: { currentWeightKg: true, initialWeightKg: true, availabilityStatus: true },
  })
  if (!lot) throw new WithdrawalChangeError('Green bean lot not found', 404)
  if (wouldOverfill(lot.initialWeightKg, lot.currentWeightKg, kg)) {
    throw new WithdrawalChangeError(lotOverfillMessage(lot.initialWeightKg, lot.currentWeightKg, kg))
  }
  const emptied = lot.currentWeightKg <= WEIGHT_EPSILON
  return tx.greenBeanLot.update({
    where: { id: lotId },
    data: {
      currentWeightKg: round6(Math.max(0, lot.currentWeightKg) + kg),
      ...(emptied && lot.availabilityStatus === 'Withdrawn' && { availabilityStatus: 'Available' as const }),
    },
    select: { id: true, currentWeightKg: true, availabilityStatus: true },
  })
}

// POST /api/green-bean-lots/:id/withdrawals/:withdrawalId/void - Void a wrong
// withdrawal (owner decision D7). Body: optional { reason }.
// In one transaction: marks the row void (voidedAt, voidedById, voidReason),
// takes the kg back off the roaster stock row a push filled (409 when the
// roaster already used them; a row left at 0 kg with no roast or sale is
// removed), and puts them back on the lot (Available again if the withdrawal
// emptied it). The row stays in the history, marked void.
// Already void = 409. Same people as recording one: the lot's creator, Admin
// and super admin.
export async function POST(
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

    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: { createdById: true },
    })
    if (!lot) {
      return NextResponse.json({ error: 'Green bean lot not found' }, { status: 404 })
    }
    requireOwnership(user, lot.createdById, ['Admin'])

    const withdrawal = await prisma.greenBeanWithdrawal.findUnique({
      where: { id: withdrawalId },
      select: {
        id: true,
        greenBeanLotId: true,
        amountKg: true,
        withdrawalType: true,
        targetRoasterId: true,
        voidedAt: true,
        createdAt: true,
      },
    })
    if (!withdrawal || withdrawal.greenBeanLotId !== id) {
      return NextResponse.json({ error: WITHDRAWAL_NOT_FOUND_MESSAGE }, { status: 404 })
    }
    if (withdrawal.voidedAt) {
      return NextResponse.json({ error: ALREADY_VOID_MESSAGE }, { status: 409 })
    }

    const reason = parseVoidBody(body)
    if (!reason.ok) {
      return NextResponse.json({ error: reason.error }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lot first, then the withdrawal row, then the roaster's stock row: the
      // order a withdrawal, a claim and a stock correction take them in.
      await tx.$queryRaw`SELECT "id" FROM "GreenBeanLot" WHERE "id" = ${id} FOR NO KEY UPDATE`
      // Guarded on not void yet, so two voids at once restore the kg once.
      const marked = await tx.greenBeanWithdrawal.updateMany({
        where: { id: withdrawalId, greenBeanLotId: id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason.value },
      })
      if (marked.count === 0) throw new WithdrawalChangeError(ALREADY_VOID_MESSAGE)

      const roasterId = await roasterToTakeBackFrom(tx, id, withdrawal)
      const roasterInventoryItem = roasterId
        ? await takeBackFromRoaster(tx, id, roasterId, withdrawal.amountKg)
        : null
      const roasterInventoryItemRemoved = roasterInventoryItem
        ? await removeIfEmpty(tx, roasterInventoryItem.id)
        : false
      await restoreLot(tx, id, withdrawal.amountKg)

      const voided = await tx.greenBeanWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: { withdrawnByUser: { select: { id: true, name: true } } },
      })
      return { withdrawal: voided, roasterInventoryItem, roasterInventoryItemRemoved }
    }, SALE_TX_OPTIONS)

    // The lot as the withdrawal POST returns it, so the client can swap it in.
    const greenBeanLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        withdrawalHistory: {
          include: { withdrawnByUser: { select: { id: true, name: true } } },
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json({
      greenBeanLot,
      withdrawal: result.withdrawal,
      roasterInventoryItem: result.roasterInventoryItem,
      // True when that row was left at 0 kg with nothing pointing at it and
      // was removed: roasterInventoryItem is then its last state.
      roasterInventoryItemRemoved: result.roasterInventoryItemRemoved,
      message: 'Withdrawal voided',
    })
  } catch (error) {
    if (error instanceof WithdrawalChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return handleApiError(error)
  }
}
