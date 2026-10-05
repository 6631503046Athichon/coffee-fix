import type { GreenBeanLot } from '@prisma/client'
import type { SaleTx } from '@/lib/saleOrders'
import { HULL_WEIGHT_SLACK_KG } from '@/lib/hullGreenWeight'
import { parseStrictNumber, safeParseFloat, todayDateOnly } from '@/lib/utils'

// A Hull & Grade turns parchment kg into one green bean lot per grade. Two
// routes record one and share these checks and writes:
//   POST /api/parchment-lots/:id/withdrawals  (withdrawalType HullAndGrade)
//   POST /api/processing-batches with `hullAndGrade`, the one-step Process &
//        Grade, which writes the batch, its parchment lot and the hull in one
//        transaction so a failed grading never leaves the parchment behind.

/** One graded lot, checked. */
export interface GradedLot {
  grade: string
  weightKg: number
  /** THB per kg, or null when the price is left for later (empty or 0). */
  pricePerKg: number | null
  /** The processor's own score, when given. */
  score: number | null
}

export type GradedLotsCheck =
  | { ok: true; lots: GradedLot[] }
  | { ok: false; error: string }

/**
 * Checks the graded lots of a Hull & Grade of `parchmentKg` kg of parchment.
 * Each lot needs a unique grade and a weight above 0; a price is optional but
 * must be a plain number of 0 or more with at most 2 decimals; together they
 * may not outweigh the parchment, and a declared total must match their sum.
 * Answers the 400 sentence for the first problem.
 */
export function checkGradedLots(
  gradedLots: unknown,
  totalGreenBeanWeight: unknown,
  parchmentKg: number,
): GradedLotsCheck {
  if (!gradedLots || !Array.isArray(gradedLots) || gradedLots.length === 0) {
    return { ok: false, error: 'Graded lots are required for Hull & Grade withdrawal' }
  }

  const declaredGreenWeight = safeParseFloat(totalGreenBeanWeight)
  let gradedWeightSum = 0
  const seenGrades = new Set<string>()
  const lots: GradedLot[] = []

  for (let i = 0; i < gradedLots.length; i++) {
    const gl = gradedLots[i]
    const grade = typeof gl?.grade === 'string' ? gl.grade.trim() : ''
    const weight = safeParseFloat(gl?.weight)

    if (!grade || weight === null || weight <= 0) {
      return { ok: false, error: 'Each graded lot must include a unique grade and a weight greater than 0' }
    }

    if (seenGrades.has(grade)) {
      return { ok: false, error: `Duplicate grade is not allowed: ${grade}` }
    }

    // Price is optional (empty or 0 = no price), but a value that is
    // present must be a plain, non-negative number ("150abc" is refused).
    const rawPrice = gl?.price
    let price: number | null = null
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
      price = parseStrictNumber(rawPrice)
      if (price === null || price < 0) {
        return { ok: false, error: `Price per kg for ${grade} must be a number of 0 or more` }
      }
      // THB to the satang, as the form allows: 220.555 is refused rather
      // than stored and audited with a third decimal.
      if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
        return { ok: false, error: `Price per kg for ${grade} must have at most 2 decimals` }
      }
    }

    seenGrades.add(grade)
    gradedWeightSum += weight
    lots.push({
      grade,
      weightKg: weight,
      pricePerKg: price !== null && price > 0 ? price : null,
      score: safeParseFloat(gl?.score),
    })
  }

  const effectiveGreenWeight = declaredGreenWeight ?? gradedWeightSum
  if (effectiveGreenWeight <= 0) {
    return { ok: false, error: 'Total green bean weight must be greater than 0' }
  }

  if (effectiveGreenWeight - parchmentKg > HULL_WEIGHT_SLACK_KG) {
    return { ok: false, error: 'Total green bean weight cannot exceed the parchment amount withdrawn' }
  }

  if (declaredGreenWeight !== null && Math.abs(gradedWeightSum - declaredGreenWeight) > HULL_WEIGHT_SLACK_KG) {
    return { ok: false, error: 'The sum of graded lots must exactly match the declared total green bean weight' }
  }

  return { ok: true, lots }
}

export interface GradedLotsWrite {
  parchmentLotId: string
  /** The Hull & Grade withdrawal that made them, so voiding it finds them. */
  parchmentWithdrawalId: string
  /** The parchment's owner: green beans hulled from it are theirs. */
  ownerId: string
  /** Who typed the prices (the caller, an Admin included). */
  pricedById: string
  lots: GradedLot[]
  /** One displayId per lot, from nextDisplayIds(prisma.greenBeanLot, 'GBL', lots.length). */
  displayIds: string[]
}

/**
 * Creates the green bean lots of a Hull & Grade inside its transaction, each
 * priced lot with the same pricing-history row as a price set later.
 */
export async function createGradedLots(tx: SaleTx, write: GradedLotsWrite): Promise<GreenBeanLot[]> {
  // Today on Thai time, anchored at 12:00 UTC like a picked date, so a lot
  // hulled before 07:00 is not dated the previous (UTC) day.
  const pricedAt = todayDateOnly()
  const created: GreenBeanLot[] = []

  for (let i = 0; i < write.lots.length; i++) {
    const lot = write.lots[i]
    const greenBeanLot = await tx.greenBeanLot.create({
      data: {
        displayId: write.displayIds[i],
        sourceType: 'Internal',
        parchmentLotId: write.parchmentLotId,
        parchmentWithdrawalId: write.parchmentWithdrawalId,
        grade: lot.grade,
        initialWeightKg: lot.weightKg,
        currentWeightKg: lot.weightKg,
        availabilityStatus: 'Available',
        createdById: write.ownerId,
        ...(lot.pricePerKg !== null && {
          pricePerKg: lot.pricePerKg,
          currency: 'THB',
          priceSetDate: pricedAt,
          priceSetBy: write.pricedById,
        }),
        ...(lot.score !== null && {
          processorScore: lot.score,
        }),
      },
    })
    created.push(greenBeanLot)

    if (lot.pricePerKg !== null) {
      await tx.pricingHistory.create({
        data: {
          greenBeanLotId: greenBeanLot.id,
          pricePerKg: lot.pricePerKg,
          currency: 'THB',
          effectiveDate: pricedAt,
          setBy: write.pricedById,
        },
      })
    }
  }

  return created
}
