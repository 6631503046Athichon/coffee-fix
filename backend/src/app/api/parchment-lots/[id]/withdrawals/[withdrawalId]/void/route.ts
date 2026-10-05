import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { SALE_TX_OPTIONS, WEIGHT_EPSILON, formatKgText, type SaleTx } from '@/lib/saleOrders'
import { EMPTY_ROASTER_STOCK_WHERE, HELD_ROASTER_STOCK_WHERE } from '@/lib/greenLotRemoval'
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

// A Hull & Grade writes its row and its green bean lots in one transaction,
// so lots hulled before prisma/sql/005 (no parchmentWithdrawalId) were
// created within moments of their withdrawal row.
const LEGACY_HULL_WINDOW_BEFORE_MS = 5_000
const LEGACY_HULL_WINDOW_AFTER_MS = 60_000
// The Hull & Grade route lets the graded weight exceed the parchment by this much.
const HULL_WEIGHT_SLACK_KG = 0.01

// Scores written on the lot itself (by a QC session or the lot's PATCH). Read
// only, to tell whether the lot was cupped.
const LOT_CUPPING_COLUMNS = [
  'cuppingFragrance',
  'cuppingFlavor',
  'cuppingAftertaste',
  'cuppingAcidity',
  'cuppingBody',
  'cuppingBalance',
  'cuppingOverall',
  'cuppingUniformity',
  'cuppingCleanCup',
  'cuppingSweetness',
] as const

const GRADED_LOTS_UNKNOWN_MESSAGE =
  'This Hull & Grade was recorded before green bean lots were linked to it, and they cannot be told apart from ' +
  'other lots of this parchment, so it cannot be voided. Correct the green bean lots instead.'

const GRADED_LOTS_GONE_MESSAGE =
  'The green bean lots this Hull & Grade made are gone, so putting its parchment back would count those kg twice. ' +
  'It cannot be voided.'

const GRADED_LOTS_CHANGED_MESSAGE =
  'The green bean lots this Hull & Grade made changed while it was being voided. Reload and try again.'

type VoidedWithdrawal = {
  id: string
  amountKg: number
  withdrawalType: string
  createdAt: Date
}

/**
 * The green bean lots a Hull & Grade made. Since prisma/sql/005 each one names
 * its withdrawal. An older one is matched by time: the Internal lots of this
 * parchment with no withdrawal link, created with the row. That is refused
 * when another Hull & Grade of the lot was recorded in the same window, when
 * nothing matches, or when the lots weigh more than the hull allowed.
 */
async function gradedLotIdsOf(tx: SaleTx, lotId: string, withdrawal: VoidedWithdrawal): Promise<string[]> {
  const linked = await tx.greenBeanLot.findMany({
    where: { parchmentWithdrawalId: withdrawal.id },
    select: { id: true },
  })
  if (linked.length > 0) return linked.map(lot => lot.id)

  const from = new Date(withdrawal.createdAt.getTime() - LEGACY_HULL_WINDOW_BEFORE_MS)
  const to = new Date(withdrawal.createdAt.getTime() + LEGACY_HULL_WINDOW_AFTER_MS)
  const otherHulls = await tx.parchmentWithdrawal.count({
    where: {
      parchmentLotId: lotId,
      withdrawalType: 'HullAndGrade',
      id: { not: withdrawal.id },
      createdAt: { gte: from, lte: to },
    },
  })
  if (otherHulls > 0) throw new WithdrawalChangeError(GRADED_LOTS_UNKNOWN_MESSAGE)

  const candidates = await tx.greenBeanLot.findMany({
    where: {
      parchmentLotId: lotId,
      parchmentWithdrawalId: null,
      sourceType: 'Internal',
      createdAt: { gte: from, lte: to },
    },
    select: { id: true, initialWeightKg: true },
  })
  if (candidates.length === 0) throw new WithdrawalChangeError(GRADED_LOTS_GONE_MESSAGE)
  const gradedKg = candidates.reduce((sum, lot) => sum + lot.initialWeightKg, 0)
  if (gradedKg > withdrawal.amountKg + HULL_WEIGHT_SLACK_KG) {
    throw new WithdrawalChangeError(GRADED_LOTS_UNKNOWN_MESSAGE)
  }
  return candidates.map(lot => lot.id)
}

/**
 * Removes the green bean lots a Hull & Grade made, which must be exactly as it
 * made them: still Available with every kg, with no withdrawal that still
 * counts (a voided one is history and goes with the lot), no roaster stock
 * that holds kg, never roasted, sold, invoiced or cupped, and with no public
 * trace QR handed out. Otherwise the void is refused (409) and nothing changes.
 *
 * Removing rather than zeroing them: a voided hull never happened, so its lots
 * must not stay behind as 0 kg stock that still counts as green beans made
 * from this parchment (and would be counted again when it is hulled again).
 * Nothing points at an untouched lot except its price history, its voided
 * withdrawals and an empty roaster stock row (a claim released to 0, or a
 * voided push from before that void removed its row), which go with it, as
 * the green bean DELETE and the harvest lot cascade remove them
 * (lib/greenLotRemoval).
 */
async function removeGradedLots(tx: SaleTx, ids: string[]) {
  // FOR UPDATE: it waits for, or blocks, anything about to point a new row at
  // these lots, so the checks below still hold when they are deleted.
  await tx.$queryRaw`SELECT "id" FROM "GreenBeanLot" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  const lots = await tx.greenBeanLot.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      displayId: true,
      grade: true,
      initialWeightKg: true,
      currentWeightKg: true,
      availabilityStatus: true,
      publicTraceId: true,
      cuppingFragrance: true,
      cuppingFlavor: true,
      cuppingAftertaste: true,
      cuppingAcidity: true,
      cuppingBody: true,
      cuppingBalance: true,
      cuppingOverall: true,
      cuppingUniformity: true,
      cuppingCleanCup: true,
      cuppingSweetness: true,
      _count: {
        select: {
          // A voided withdrawal never happened: it is history and goes with
          // the lot (the schema cascades it).
          withdrawalHistory: { where: { voidedAt: null } },
          // An empty roaster stock row holds nothing: it goes with the lot.
          roasterInventory: { where: HELD_ROASTER_STOCK_WHERE },
          roastBatches: true,
          saleOrderItems: true,
          invoiceItems: true,
          cuppingSamples: true,
          cuppingScores: true,
        },
      },
    },
  })
  if (lots.length !== ids.length) throw new WithdrawalChangeError(GRADED_LOTS_CHANGED_MESSAGE)

  const used: string[] = []
  for (const lot of lots) {
    const why: string[] = []
    const counts = lot._count
    if (counts.withdrawalHistory > 0) why.push('has withdrawals')
    if (counts.roasterInventory > 0) why.push('was claimed by a roaster')
    if (counts.roastBatches > 0) why.push('was roasted')
    if (counts.saleOrderItems > 0 || counts.invoiceItems > 0) why.push('is on a sale or invoice')
    const scored = LOT_CUPPING_COLUMNS.some(column => lot[column] != null)
    if (counts.cuppingSamples > 0 || counts.cuppingScores > 0 || scored) why.push('was cupped')
    if (Math.abs(lot.currentWeightKg - lot.initialWeightKg) > WEIGHT_EPSILON) {
      why.push(`holds ${formatKgText(lot.currentWeightKg)} of its ${formatKgText(lot.initialWeightKg)} kg`)
    }
    if (lot.availabilityStatus !== 'Available') why.push('was taken off the market')
    if (lot.publicTraceId) why.push('has a public trace QR')
    if (why.length > 0) used.push(`${lot.displayId ?? lot.id} (${lot.grade}) ${why.join(', ')}`)
  }
  if (used.length > 0) {
    throw new WithdrawalChangeError(
      `This Hull & Grade cannot be voided because green bean lots it made were already used: ${used.join('; ')}.`,
    )
  }

  // Under the lot lock above, so no claim can fill these rows in between.
  await tx.roasterInventoryItem.deleteMany({
    where: { greenBeanLotId: { in: ids }, ...EMPTY_ROASTER_STOCK_WHERE },
  })
  const removed = await tx.greenBeanLot.deleteMany({ where: { id: { in: ids } } })
  if (removed.count !== ids.length) throw new WithdrawalChangeError(GRADED_LOTS_CHANGED_MESSAGE)
  return lots.map(lot => ({
    id: lot.id,
    displayId: lot.displayId,
    grade: lot.grade,
    initialWeightKg: lot.initialWeightKg,
  }))
}

/**
 * Puts `kg` back on the parchment lot. The withdrawal route marks a lot it
 * empties Hulled, so a lot at 0 kg goes back to AwaitingHulling; a lot marked
 * Hulled by hand while it still held kg keeps its status.
 */
async function restoreLot(tx: SaleTx, lotId: string, kg: number) {
  const lot = await tx.parchmentLot.findUnique({
    where: { id: lotId },
    select: { currentWeightKg: true, initialWeightKg: true, status: true },
  })
  if (!lot) throw new WithdrawalChangeError('Parchment lot not found', 404)
  if (wouldOverfill(lot.initialWeightKg, lot.currentWeightKg, kg)) {
    throw new WithdrawalChangeError(lotOverfillMessage(lot.initialWeightKg, lot.currentWeightKg, kg))
  }
  const emptied = lot.currentWeightKg <= WEIGHT_EPSILON
  return tx.parchmentLot.update({
    where: { id: lotId },
    data: {
      currentWeightKg: round6(Math.max(0, lot.currentWeightKg) + kg),
      ...(emptied && lot.status === 'Hulled' && { status: 'AwaitingHulling' as const }),
    },
    select: { id: true, currentWeightKg: true, status: true },
  })
}

// POST /api/parchment-lots/:id/withdrawals/:withdrawalId/void - Void a wrong
// withdrawal (owner decision D7). Body: optional { reason }.
// In one transaction: marks the row void (voidedAt, voidedById, voidReason),
// removes the green bean lots a Hull & Grade made (409 when any was used, see
// removeGradedLots), and puts the kg back on the parchment lot
// (AwaitingHulling again if the withdrawal emptied it). A parchment Roasting
// Stock withdrawal only names its roaster: no roaster stock row holds its kg,
// so there is nothing to take back. The row stays in the history, marked
// void. Already void = 409. Same people as recording one: the Processor who
// created the lot's batch, Admin and super admin.
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
      select: {
        id: true,
        parchmentLotId: true,
        amountKg: true,
        withdrawalType: true,
        createdAt: true,
        voidedAt: true,
      },
    })
    if (!withdrawal || withdrawal.parchmentLotId !== id) {
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
      // Lot first, then the withdrawal row, then its green bean lots: the
      // order a withdrawal takes them in.
      await tx.$queryRaw`SELECT "id" FROM "ParchmentLot" WHERE "id" = ${id} FOR NO KEY UPDATE`
      // Guarded on not void yet, so two voids at once restore the kg once.
      const marked = await tx.parchmentWithdrawal.updateMany({
        where: { id: withdrawalId, parchmentLotId: id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason.value },
      })
      if (marked.count === 0) throw new WithdrawalChangeError(ALREADY_VOID_MESSAGE)

      const removedGreenBeanLots =
        withdrawal.withdrawalType === 'HullAndGrade'
          ? await removeGradedLots(tx, await gradedLotIdsOf(tx, id, withdrawal))
          : []
      await restoreLot(tx, id, withdrawal.amountKg)

      const voided = await tx.parchmentWithdrawal.findUnique({ where: { id: withdrawalId } })
      return { withdrawal: voided, removedGreenBeanLots }
    }, SALE_TX_OPTIONS)

    // The lot as the withdrawal POST returns it, so the client can swap it in.
    const parchmentLot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        withdrawalHistory: {
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json({
      parchmentLot,
      withdrawal: result.withdrawal,
      removedGreenBeanLots: result.removedGreenBeanLots,
      message: 'Withdrawal voided',
    })
  } catch (error) {
    if (error instanceof WithdrawalChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return handleApiError(error)
  }
}
