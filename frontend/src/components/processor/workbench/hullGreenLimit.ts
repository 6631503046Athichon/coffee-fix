// The green bean lots one Hull & Grade made never weigh more than the
// parchment it hulled: the Hull & Grade refuses it when it is recorded, and
// the backend refuses (400) a later correction of one of its lots that would
// break it (PUT /green-bean-lots/:id). The Edit green bean lot popup works out
// the same limit from the loaded data, so the user sees it before saving.
// Mirrors backend/src/lib/hullGreenWeight.ts.

import { GreenBeanSourceType } from '../../../types'
import type { GreenBeanLot, ParchmentLot } from '../../../types'
import { madeByHullAndGrade } from './withdrawalCorrections'

/** The Hull & Grade lets the graded weight exceed the parchment by this much. */
export const HULL_WEIGHT_SLACK_KG = 0.01

// Lots hulled before prisma/sql/005 name no withdrawal: they were created
// within moments of their Hull & Grade row (the window its void uses).
const LEGACY_HULL_WINDOW_BEFORE_MS = 5_000
const LEGACY_HULL_WINDOW_AFTER_MS = 60_000
const LEGACY_HULL_CLEAR_MS = 2 * LEGACY_HULL_WINDOW_AFTER_MS

export interface HullGreenLimit {
  /** 'hull': the Hull & Grade that made the lot. 'parchment': all of its parchment's. */
  scope: 'hull' | 'parchment'
  /** Parchment kg hulled. */
  parchmentKg: number
  /** Green kg of the other lots made from it. */
  otherGreenKg: number
  /** The most this lot may weigh. */
  maxKg: number
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6
const time = (iso?: string): number => (iso ? Date.parse(iso) : NaN)
const sumKg = (lots: GreenBeanLot[]): number =>
  round6(lots.reduce((sum, g) => sum + (Number(g.initialWeightKg) || 0), 0))

const limitOf = (
  scope: HullGreenLimit['scope'],
  parchmentKg: number,
  others: GreenBeanLot[],
): HullGreenLimit => {
  const otherGreenKg = sumKg(others)
  return {
    scope,
    parchmentKg,
    otherGreenKg,
    maxKg: Math.max(0, round6(parchmentKg - otherGreenKg)),
  }
}

/**
 * The limit on `lot`'s weight from the Hull & Grade that made it, or null when
 * no Hull & Grade made it or the loaded data cannot tell (the backend still
 * checks). `parchmentLot` must carry its withdrawal history.
 */
export const hullGreenLimit = (
  lot: GreenBeanLot,
  parchmentLot: ParchmentLot | undefined,
  greenBeanLots: GreenBeanLot[],
): HullGreenLimit | null => {
  if (!madeByHullAndGrade(lot) || !parchmentLot?.withdrawalHistory) return null
  const hulls = parchmentLot.withdrawalHistory.filter(
    (w) => w.withdrawalType === 'HullAndGrade' && !w.voidedAt,
  )
  const others = greenBeanLots.filter((g) => g.id !== lot.id)

  if (lot.parchmentWithdrawalId) {
    const hull = hulls.find((w) => w.id === lot.parchmentWithdrawalId)
    if (hull) {
      return limitOf(
        'hull',
        hull.amountKg,
        others.filter((g) => g.parchmentWithdrawalId === hull.id),
      )
    }
  }

  const fromParchment = others.filter(
    (g) =>
      g.parchmentLotId === parchmentLot.id &&
      g.sourceType === GreenBeanSourceType.Internal,
  )

  const madeAt = time(lot.createdAt)
  if (!lot.parchmentWithdrawalId && Number.isFinite(madeAt)) {
    // A Hull & Grade row's date is when it was recorded.
    const nearby = hulls.filter(
      (w) => Math.abs(time(w.date) - madeAt) <= LEGACY_HULL_CLEAR_MS,
    )
    const hulledAt = nearby.length === 1 ? time(nearby[0].date) : NaN
    if (
      hulledAt >= madeAt - LEGACY_HULL_WINDOW_AFTER_MS &&
      hulledAt <= madeAt + LEGACY_HULL_WINDOW_BEFORE_MS
    ) {
      return limitOf(
        'hull',
        nearby[0].amountKg,
        fromParchment.filter((g) => {
          const at = time(g.createdAt)
          return (
            !g.parchmentWithdrawalId &&
            at >= hulledAt - LEGACY_HULL_WINDOW_BEFORE_MS &&
            at <= hulledAt + LEGACY_HULL_WINDOW_AFTER_MS
          )
        }),
      )
    }
  }

  const parchmentKg = round6(hulls.reduce((sum, w) => sum + (Number(w.amountKg) || 0), 0))
  if (parchmentKg <= 0) return null
  return limitOf('parchment', parchmentKg, fromParchment)
}

/** Whether `weightKg` makes the lots of the Hull & Grade outweigh its parchment. */
export const exceedsHull = (limit: HullGreenLimit, weightKg: number): boolean =>
  weightKg + limit.otherGreenKg - limit.parchmentKg > HULL_WEIGHT_SLACK_KG

/** "At most 8.00 kg: its Hull & Grade hulled 16.00 kg of parchment and ..." */
export const hullLimitText = (limit: HullGreenLimit): string =>
  `At most ${limit.maxKg.toFixed(2)} kg: ${
    limit.scope === 'hull' ? 'its Hull & Grade' : "its parchment's Hull & Grades"
  } hulled ${limit.parchmentKg.toFixed(2)} kg of parchment and the other green bean lots weigh ${limit.otherGreenKg.toFixed(2)} kg.`
