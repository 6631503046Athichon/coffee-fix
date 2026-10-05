import type { Prisma } from '@prisma/client'
import { WEIGHT_EPSILON, type SaleTx } from '@/lib/saleOrders'

// When a green bean lot may be deleted, shared by
//   DELETE /api/green-bean-lots/:id
//   DELETE /api/harvest-lots/:id?cascade=1 (the green bean lots made from it)
// and the roaster stock row a voided Roasting Stock push leaves behind
// (POST /api/green-bean-lots/:id/withdrawals/:withdrawalId/void).
//
// A lot goes only while nothing uses it: no withdrawal that still counts (a
// voided one never happened and goes with the lot, the schema cascades it),
// no roaster stock that holds kg, no roast, no sale order or invoice line and
// no cupping sample. Withdrawals, price history and cupping scores cascade
// with the lot; everything else would lose it, so the delete is refused.

/**
 * A roaster stock row (RoasterInventoryItem) that holds nothing: no kg
 * claimed or on the shelf, and no roast or sale pointing at it. Voiding the
 * Roasting Stock push that made a row leaves it like this on data from before
 * the void removed it. It is no stock, so it never keeps a lot from being
 * deleted: it goes with the lot.
 */
export const EMPTY_ROASTER_STOCK_WHERE = {
  claimedWeightKg: { lte: WEIGHT_EPSILON },
  remainingWeightKg: { lte: WEIGHT_EPSILON },
  roastBatches: { none: {} },
  saleOrderItems: { none: {} },
} satisfies Prisma.RoasterInventoryItemWhereInput

/** Roaster stock that is real: kg claimed or on the shelf, or a roast or sale from it. */
export const HELD_ROASTER_STOCK_WHERE = {
  OR: [
    { claimedWeightKg: { gt: WEIGHT_EPSILON } },
    { remainingWeightKg: { gt: WEIGHT_EPSILON } },
    { roastBatches: { some: {} } },
    { saleOrderItems: { some: {} } },
  ],
} satisfies Prisma.RoasterInventoryItemWhereInput

/** What keeps a green bean lot from being deleted, as a `_count` select. */
export const GREEN_LOT_USES_COUNT = {
  // A voided withdrawal (D7) never happened: it goes with the lot.
  withdrawalHistory: { where: { voidedAt: null } },
  roasterInventory: { where: HELD_ROASTER_STOCK_WHERE },
  roastBatches: true,
  saleOrderItems: true,
  invoiceItems: true,
  cuppingSamples: true,
} satisfies Prisma.GreenBeanLotCountOutputTypeSelect

type GreenLotUseCounts = {
  withdrawalHistory: number
  roasterInventory: number
  roastBatches: number
  saleOrderItems: number
  invoiceItems: number
  cuppingSamples: number
}

/** The `_count` of GREEN_LOT_USES_COUNT as the dependents a refusal lists (lib/lotCorrections labels). */
export function greenLotDependents(counts: Partial<GreenLotUseCounts> | null | undefined) {
  return {
    withdrawals: counts?.withdrawalHistory ?? 0,
    roasterInventory: counts?.roasterInventory ?? 0,
    roastBatches: counts?.roastBatches ?? 0,
    saleOrderItems: counts?.saleOrderItems ?? 0,
    invoiceItems: counts?.invoiceItems ?? 0,
    cuppingSamples: counts?.cuppingSamples ?? 0,
  }
}

/**
 * Deletes the green bean lots `ids` that nothing uses, with their empty
 * roaster stock rows, inside `tx`. The delete repeats the rule, so a
 * withdrawal, claim, roast, sale or cupping sample that landed after the
 * caller's check makes that lot match nothing: compare the count returned
 * with `ids.length` and throw to roll the transaction back.
 */
export async function deleteUnusedGreenLots(tx: SaleTx, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  await tx.roasterInventoryItem.deleteMany({
    where: { greenBeanLotId: { in: ids }, ...EMPTY_ROASTER_STOCK_WHERE },
  })
  const { count } = await tx.greenBeanLot.deleteMany({
    where: {
      id: { in: ids },
      withdrawalHistory: { none: { voidedAt: null } },
      // Only stock that holds something is left after the line above.
      roasterInventory: { none: {} },
      roastBatches: { none: {} },
      saleOrderItems: { none: {} },
      invoiceItems: { none: {} },
      cuppingSamples: { none: {} },
    },
  })
  return count
}
