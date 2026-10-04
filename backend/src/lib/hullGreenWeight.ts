import type { SaleTx } from '@/lib/saleOrders'

// A Hull & Grade turns parchment kg into green bean lots, and its route
// refuses lots that weigh more than the parchment it took. Correcting one of
// those lots later (PUT /api/green-bean-lots/:id) keeps the same rule: the
// green bean lots one Hull & Grade made never weigh more than the parchment
// it hulled, so 16 kg of parchment cannot turn into 17 kg of green beans.

/** The Hull & Grade route lets the graded weight exceed the parchment by this much. */
export const HULL_WEIGHT_SLACK_KG = 0.01

// Lots hulled before prisma/sql/005 name no withdrawal. A Hull & Grade writes
// its row and its lots in one transaction, so they were created within
// moments of the row: the same window the Hull & Grade void matches them by.
const LEGACY_HULL_WINDOW_BEFORE_MS = 5_000
const LEGACY_HULL_WINDOW_AFTER_MS = 60_000
// Any other Hull & Grade of the parchment this close to the matched one could
// own some of the lots in its window, so the match is not trusted then.
const LEGACY_HULL_CLEAR_MS = 2 * LEGACY_HULL_WINDOW_AFTER_MS

/** The transaction client (the app's Prisma client is extended). */
type Db = SaleTx

/** What the check needs to know about the lot being corrected. */
export interface HulledLot {
  id: string
  sourceType: string
  parchmentLotId: string | null
  parchmentWithdrawalId: string | null
  createdAt: Date
}

export interface HullLimit {
  /**
   * 'hull': the one Hull & Grade that made the lot. 'parchment': every Hull &
   * Grade of its parchment lot, for an older lot whose hull cannot be told.
   */
  scope: 'hull' | 'parchment'
  /** Parchment kg hulled. */
  parchmentKg: number
  /** Green kg of the other lots made from it. */
  otherGreenKg: number
  /** The parchment lot, as the message names it. */
  parchmentLabel: string
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6

/**
 * Whether a Hull & Grade made the lot: linked to it since prisma/sql/005, or
 * before that an Internal lot of a parchment lot (as the DELETE route reads it).
 */
export function madeByHullAndGrade(
  lot: Pick<HulledLot, 'sourceType' | 'parchmentLotId' | 'parchmentWithdrawalId'>,
): boolean {
  return Boolean(lot.parchmentWithdrawalId) ||
    (lot.sourceType === 'Internal' && Boolean(lot.parchmentLotId))
}

/** The most the lot may weigh. */
export function maxGreenKg(limit: HullLimit): number {
  return Math.max(0, round6(limit.parchmentKg - limit.otherGreenKg))
}

/** Whether `weightKg` on this lot makes its Hull & Grade's lots outweigh the parchment. */
export function exceedsHull(limit: HullLimit, weightKg: number): boolean {
  return weightKg + limit.otherGreenKg - limit.parchmentKg > HULL_WEIGHT_SLACK_KG
}

/** The 400 sentence for a weight over the limit. */
export function overHullMessage(limit: HullLimit): string {
  const hull = limit.scope === 'hull'
    ? `The Hull & Grade of parchment lot ${limit.parchmentLabel} hulled`
    : `The Hull & Grades of parchment lot ${limit.parchmentLabel} hulled`
  return 'Green bean lots cannot weigh more than the parchment they were hulled from. ' +
    `${hull} ${limit.parchmentKg.toFixed(2)} kg of parchment and its other green bean lots weigh ` +
    `${limit.otherGreenKg.toFixed(2)} kg, so this lot can weigh at most ${maxGreenKg(limit).toFixed(2)} kg.`
}

/** Thrown inside the correction transaction; the route answers 400. */
export class OverHullError extends Error {
  constructor(public readonly limit: HullLimit) {
    super(overHullMessage(limit))
    this.name = 'OverHullError'
  }
}

const sumOf = (value: number | null | undefined) => round6(value ?? 0)
const shift = (date: Date, ms: number) => new Date(date.getTime() + ms)

/**
 * The parchment kg the lot's Hull & Grade took and what its other lots weigh,
 * or null when no Hull & Grade made the lot (or none is on record to hold it
 * to). A lot linked to its hull (prisma/sql/005) is held to that hull. An
 * older lot is matched to the one Hull & Grade of its parchment recorded with
 * it; when that cannot be told, it is held to all of the parchment's Hull &
 * Grades against all of the parchment's green bean lots.
 */
export async function hullLimitOf(db: Db, lot: HulledLot): Promise<HullLimit | null> {
  if (!madeByHullAndGrade(lot)) return null

  if (lot.parchmentWithdrawalId) {
    const hull = await db.parchmentWithdrawal.findUnique({
      where: { id: lot.parchmentWithdrawalId },
      select: {
        amountKg: true,
        voidedAt: true,
        parchmentLot: { select: { id: true, displayId: true } },
      },
    })
    if (hull && !hull.voidedAt) {
      const others = await db.greenBeanLot.aggregate({
        where: { parchmentWithdrawalId: lot.parchmentWithdrawalId, id: { not: lot.id } },
        _sum: { initialWeightKg: true },
      })
      return {
        scope: 'hull',
        parchmentKg: hull.amountKg,
        otherGreenKg: sumOf(others._sum.initialWeightKg),
        parchmentLabel: hull.parchmentLot?.displayId ?? hull.parchmentLot?.id ?? 'its parchment lot',
      }
    }
  }

  if (!lot.parchmentLotId) return null
  const parchmentLotId = lot.parchmentLotId
  const parchment = await db.parchmentLot.findUnique({
    where: { id: parchmentLotId },
    select: { id: true, displayId: true },
  })
  if (!parchment) return null
  const parchmentLabel = parchment.displayId ?? parchment.id

  if (!lot.parchmentWithdrawalId) {
    const nearby = await db.parchmentWithdrawal.findMany({
      where: {
        parchmentLotId,
        withdrawalType: 'HullAndGrade',
        voidedAt: null,
        createdAt: {
          gte: shift(lot.createdAt, -LEGACY_HULL_CLEAR_MS),
          lte: shift(lot.createdAt, LEGACY_HULL_CLEAR_MS),
        },
      },
      select: { amountKg: true, createdAt: true },
    })
    const [hull] = nearby
    const madeIt =
      nearby.length === 1 &&
      hull.createdAt.getTime() >= lot.createdAt.getTime() - LEGACY_HULL_WINDOW_AFTER_MS &&
      hull.createdAt.getTime() <= lot.createdAt.getTime() + LEGACY_HULL_WINDOW_BEFORE_MS
    if (madeIt) {
      const others = await db.greenBeanLot.aggregate({
        where: {
          parchmentLotId,
          parchmentWithdrawalId: null,
          sourceType: 'Internal',
          id: { not: lot.id },
          createdAt: {
            gte: shift(hull.createdAt, -LEGACY_HULL_WINDOW_BEFORE_MS),
            lte: shift(hull.createdAt, LEGACY_HULL_WINDOW_AFTER_MS),
          },
        },
        _sum: { initialWeightKg: true },
      })
      return {
        scope: 'hull',
        parchmentKg: hull.amountKg,
        otherGreenKg: sumOf(others._sum.initialWeightKg),
        parchmentLabel,
      }
    }
  }

  const hulled = await db.parchmentWithdrawal.aggregate({
    where: { parchmentLotId, withdrawalType: 'HullAndGrade', voidedAt: null },
    _sum: { amountKg: true },
  })
  const parchmentKg = sumOf(hulled._sum.amountKg)
  // No Hull & Grade on record: the lot was entered by hand against the
  // parchment lot, and there is nothing to hold it to.
  if (parchmentKg <= 0) return null
  const others = await db.greenBeanLot.aggregate({
    where: { parchmentLotId, sourceType: 'Internal', id: { not: lot.id } },
    _sum: { initialWeightKg: true },
  })
  return {
    scope: 'parchment',
    parchmentKg,
    otherGreenKg: sumOf(others._sum.initialWeightKg),
    parchmentLabel,
  }
}
