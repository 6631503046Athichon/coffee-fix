// The optional "Price / kg" typed on each grade-split row (Hull & Grade and
// Process & Grade). Left empty, the new green bean lot has no price and the
// processor sets it later with "Set price". Filled in, it must be a THB amount
// above 0 with at most two decimals; the backend then stamps it on the lot
// (priceSetDate / priceSetBy) and writes a pricing-history row.

// A plain decimal: "250", "250.5", ".5", "-1". Anything else ("abc", "1e3",
// "12,50", "250฿") is not a number here.
const DECIMAL_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/
// Thousands written with commas the way the totals show them: "1,200",
// "12,500.50". The commas are dropped before the value is read.
const GROUPED_PATTERN = /^\d{1,3}(,\d{3})+(\.\d*)?$/

/** The typed price with any thousands commas dropped, or null if unreadable. */
const normalise = (raw: string): string | null => {
  const value = raw.trim()
  if (GROUPED_PATTERN.test(value)) return value.replace(/,/g, '')
  return DECIMAL_PATTERN.test(value) ? value : null
}

/** The inline error for a typed price, or null when it is empty or valid. */
export const gradePriceError = (raw: string): string | null => {
  if (raw.trim() === '') return null
  const value = normalise(raw)
  if (value === null) return 'Numbers only, e.g. 1200.50'
  if (Number(value) <= 0) return 'Must be more than 0'
  const decimals = value.split('.')[1] ?? ''
  if (decimals.length > 2) return 'Max 2 decimals'
  return null
}

/** True when any row has a price that would be refused. */
export const hasGradePriceError = (rows: { price: string }[]): boolean =>
  rows.some((row) => gradePriceError(row.price) !== null)

/**
 * The price to send as gradedLots[i].price: undefined when the row has none
 * (or an invalid one, which the form blocks before it gets here).
 */
export const parseGradePrice = (raw: string): number | undefined => {
  if (raw.trim() === '' || gradePriceError(raw) !== null) return undefined
  return Number(normalise(raw))
}

export interface GradeSplitValueSummary {
  /** Sum of kg × price per kg over the rows that have both. */
  value: number
  /** Rows with a weight above 0 and a valid price. */
  pricedRows: number
  /** Rows with a weight above 0, priced or not. */
  weighedRows: number
}

/**
 * Total value of the priced rows (kg × price per kg), or null while no row
 * has both a weight and a valid price, so the summary leaves the figure out
 * rather than showing a value of 0.
 */
export const gradeSplitValue = (
  rows: { weight: string; price: string }[],
): GradeSplitValueSummary | null => {
  let value = 0
  let pricedRows = 0
  let weighedRows = 0
  for (const row of rows) {
    const weight = parseFloat(row.weight)
    if (!Number.isFinite(weight) || weight <= 0) continue
    weighedRows += 1
    const price = parseGradePrice(row.price)
    if (price === undefined) continue
    pricedRows += 1
    value += weight * price
  }
  return pricedRows > 0 ? { value, pricedRows, weighedRows } : null
}

/** "12,500.00 THB", the same notation as the lot cards and the sale total. */
export const formatBaht = (value: number): string =>
  `${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} THB`

/** Accessible name of the price input on grade-split row `row` (1-based). */
export const gradePriceLabel = (row: number): string =>
  `Price per kg in THB (optional), row ${row}`
