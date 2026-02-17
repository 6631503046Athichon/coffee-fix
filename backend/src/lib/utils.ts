/**
 * Safely parse float value
 * Returns null if value is undefined, null, or not a valid number
 */
export function safeParseFloat(value: any): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseFloat(value)
  return isNaN(parsed) ? null : parsed
}

/**
 * Safely parse integer value
 * Returns null if value is undefined, null, or not a valid number
 */
export function safeParseInt(value: any): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? null : parsed
}

/**
 * Generate the next sequential displayId for a given prefix.
 * Format: {PREFIX}-{YEAR}-{NUMBER} e.g. HL-2026-1, PB-2026-2
 * Queries the table for the highest existing number in the current year.
 */
export async function nextDisplayId(
  model: { findMany: (args: any) => Promise<any[]> },
  prefix: string
): Promise<string> {
  const year = new Date().getFullYear()
  const yearPrefix = `${prefix}-${year}-`

  const items = await model.findMany({
    where: {
      displayId: { startsWith: yearPrefix },
    },
    select: { displayId: true },
    orderBy: { createdAt: 'desc' },
  })

  let maxNum = 0
  for (const item of items) {
    const num = parseInt((item.displayId as string).replace(yearPrefix, ''))
    if (!isNaN(num) && num > maxNum) maxNum = num
  }

  return `${yearPrefix}${maxNum + 1}`
}
