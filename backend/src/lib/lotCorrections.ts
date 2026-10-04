// Correcting a parchment or green-bean lot after it was recorded (F24).
//
// A lot's stock left is its weight minus what has already gone out of it:
// withdrawn, hulled, sent to a roaster or sold. A correction re-weighs the
// lot but never takes back what went out, so the new weight cannot go below
// it and the kg left moves by the same amount as the weight.
//
// Deletes only remove a lot nothing downstream depends on; otherwise the
// route answers 409 with the counts, and the records are corrected (or
// voided) one by one instead.

/** Float dust below this counts as nothing left, as in the withdrawal routes. */
export const STOCK_DUST_KG = 0.01

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6

interface LotWeights {
  initialWeightKg: number
  currentWeightKg: number
}

/** Kg that has already gone out of the lot. Never negative. */
export function kgAlreadyOut(lot: LotWeights): number {
  return Math.max(0, round6(lot.initialWeightKg - lot.currentWeightKg))
}

export type ReweighResult =
  | { ok: true; initialWeightKg: number; currentWeightKg: number; depleted: boolean }
  | { ok: false; outKg: number }

/**
 * The lot's weights after re-weighing it to `newWeightKg`, or the kg already
 * out when the new weight would fall below it.
 */
export function reweighLot(lot: LotWeights, newWeightKg: number): ReweighResult {
  const outKg = kgAlreadyOut(lot)
  if (newWeightKg < outKg - 1e-6) return { ok: false, outKg }
  const left = round6(newWeightKg - outKg)
  const currentWeightKg = left < STOCK_DUST_KG ? 0 : left
  return { ok: true, initialWeightKg: newWeightKg, currentWeightKg, depleted: currentWeightKg <= 0 }
}

/** The 409 sentence for a weight below what already went out. */
export function belowOutMessage(lotKind: string, outKg: number): string {
  return `${outKg.toFixed(2)} kg of this ${lotKind} has already been withdrawn, hulled or sold, so its weight cannot go below ${outKg.toFixed(2)} kg`
}

/**
 * Thrown inside a correction transaction when the guarded write matched no
 * row: the lot changed (a withdrawal, say) after it was read. Mapped to 409.
 */
export const LOT_CHANGED = 'LOT_CHANGED'
export const LOT_CHANGED_MESSAGE =
  'This lot changed while you were editing it, so nothing was saved. Reload and try again.'

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

const DEPENDENT_LABELS: Record<string, [string, string]> = {
  parchmentLots: ['parchment lot', 'parchment lots'],
  withdrawals: ['withdrawal', 'withdrawals'],
  greenBeanLots: ['green bean lot', 'green bean lots'],
  roasterInventory: ['roaster stock record', 'roaster stock records'],
  roastBatches: ['roast batch', 'roast batches'],
  saleOrderItems: ['sale order line', 'sale order lines'],
  invoiceItems: ['invoice line', 'invoice lines'],
  cuppingSamples: ['cupping sample', 'cupping samples'],
}

/** "2 withdrawals and 1 green bean lot": only the non-zero counts. */
export function describeDependents(dependents: Record<string, number>): string {
  const parts = Object.entries(dependents)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const [one, many] = DEPENDENT_LABELS[key] ?? [key, key]
      return plural(count, one, many)
    })
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function hasDependents(dependents: Record<string, number>): boolean {
  return Object.values(dependents).some((count) => count > 0)
}
