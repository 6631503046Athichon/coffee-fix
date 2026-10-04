// Correcting a batch, parchment lot or green-bean lot after it was recorded
// (F24). A lot's weight is its whole recorded weight (initialWeightKg); the
// kg left (currentWeightKg) is that minus what already went out of it:
// withdrawn, hulled, sent to a roaster or sold. A correction re-weighs the
// lot, so the kg left moves by the same amount and the weight can never go
// below what went out. The backend refuses that with a 409; the edit popups
// say so before sending.

type LotWeights = { initialWeightKg?: number; currentWeightKg?: number }

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6

/** Kg that already went out of the lot. Never negative. */
export const kgAlreadyOut = (lot: LotWeights): number => {
  const initial = Number(lot.initialWeightKg)
  const current = Number(lot.currentWeightKg)
  if (!Number.isFinite(initial) || !Number.isFinite(current)) return 0
  return Math.max(0, round6(initial - current))
}

/** The kg left once the lot is re-weighed to `weightKg`. */
export const kgLeftAfter = (lot: LotWeights, weightKg: number): number =>
  Math.max(0, round6(weightKg - kgAlreadyOut(lot)))

/**
 * Why `raw` is not a weight the lot can be corrected to, or null when it is.
 * `maxKg` caps parchment at the cherry it came from, as on create.
 */
export const lotWeightError = (
  raw: string,
  outKg: number,
  maxKg?: number,
): string | null => {
  const text = raw.trim()
  const value = Number(text)
  if (!text || !Number.isFinite(value) || value <= 0) {
    return 'Enter a weight greater than 0.'
  }
  if (value < outKg - 1e-6) {
    return `${outKg.toFixed(2)} kg of this lot already went out, so its weight cannot go below ${outKg.toFixed(2)} kg.`
  }
  if (maxKg !== undefined && Number.isFinite(maxKg) && value > maxKg + 1e-9) {
    return `Parchment cannot weigh more than the cherry lot it came from (${maxKg.toFixed(2)} kg).`
  }
  return null
}

/** Why `raw` is not a moisture percentage, or null when it is. */
export const moistureError = (raw: string): string | null => {
  const text = raw.trim()
  const value = Number(text)
  if (!text || !Number.isFinite(value) || value < 0 || value > 100) {
    return 'Enter a moisture between 0 and 100%.'
  }
  return null
}

/** Two stored numbers the same to the gram (a typed "80" vs a stored 80.0). */
export const sameKg = (a: number | undefined, b: number | undefined): boolean =>
  a !== undefined && b !== undefined && Math.abs(a - b) < 1e-9

/**
 * The text shown for a failed save. A failed ownership or role check comes
 * back as a 403 whose message the api client throws as is.
 */
export const correctionErrorMessage = (
  err: unknown,
  permissionMessage: string,
  fallback: string,
): string => {
  const raw = err instanceof Error ? err.message : ''
  if (raw === 'Forbidden' || raw === 'Insufficient permissions') return permissionMessage
  return raw || fallback
}
