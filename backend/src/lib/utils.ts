/**
 * Safely parse float value
 * Returns null if value is undefined, null, or not a valid number
 */
export function safeParseFloat(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseFloat(String(value))
  return isNaN(parsed) ? null : parsed
}

/**
 * Safely parse integer value
 * Returns null if value is undefined, null, or not a valid number
 */
export function safeParseInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = parseInt(String(value), 10)
  return isNaN(parsed) ? null : parsed
}

/**
 * Generate the next sequential displayId for a given prefix.
 * Format: {PREFIX}-{YEAR}-{NUMBER} e.g. HL-2026-1, PB-2026-2
 * Queries the table for the highest existing number in the current year.
 *
 * NOTE: This read-then-compute is racy on its own — two concurrent callers
 * compute the same `maxNum + 1`. The Prisma schema marks `displayId` as
 * `@unique`, so the database rejects the second insert with P2002. Wrap the
 * `nextDisplayId` + `create` pair in `withDisplayIdRetry` so the second
 * caller re-reads max and retries.
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
  })

  let maxNum = 0
  for (const item of items) {
    const num = parseInt((item.displayId as string).replace(yearPrefix, ''))
    if (!isNaN(num) && num > maxNum) maxNum = num
  }

  return `${yearPrefix}${maxNum + 1}`
}

/**
 * Allocate N sequential displayIds in one read, e.g. for a HullAndGrade
 * withdrawal that creates several green-bean lots in one transaction.
 *
 * Calling `nextDisplayId()` in a loop is wrong: each iteration re-reads the
 * same DB max (the prior in-loop creates aren't committed yet), so every
 * iteration returns the same string and the unique constraint blows up at
 * insert time. This helper reads max once and returns
 * `[max+1, max+2, ..., max+count]`.
 *
 * Pair with `withDisplayIdRetry` to handle concurrent allocators.
 */
export async function nextDisplayIds(
  model: { findMany: (args: any) => Promise<any[]> },
  prefix: string,
  count: number,
): Promise<string[]> {
  if (count <= 0) return []
  const year = new Date().getFullYear()
  const yearPrefix = `${prefix}-${year}-`

  const items = await model.findMany({
    where: { displayId: { startsWith: yearPrefix } },
    select: { displayId: true },
  })

  let maxNum = 0
  for (const item of items) {
    const num = parseInt((item.displayId as string).replace(yearPrefix, ''))
    if (!isNaN(num) && num > maxNum) maxNum = num
  }

  return Array.from({ length: count }, (_, i) => `${yearPrefix}${maxNum + 1 + i}`)
}

/**
 * Detect whether a thrown Prisma error is a unique-constraint violation on a
 * `displayId` column. Handles both shapes Prisma returns for `meta.target`:
 *   - string: 'displayId'
 *   - string[]: ['displayId']  (composite uniques include it)
 */
function isDisplayIdConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; meta?: { target?: unknown } }
  if (e.code !== 'P2002') return false
  const target = e.meta?.target
  if (typeof target === 'string') return target === 'displayId' || target.includes('displayId')
  if (Array.isArray(target)) return target.includes('displayId')
  return false
}

/**
 * Run an operation that allocates a `displayId` and creates a row. If the
 * insert collides with another concurrent allocator (Prisma P2002 on
 * `displayId`), retry up to `maxRetries` times — each retry re-reads max so
 * the loser sees the winner's row and bumps its own number.
 *
 * Use this to wrap the entire `nextDisplayId(...) + tx.create(...)` block
 * (or the whole `$transaction` if `nextDisplayId` is mixed with other
 * mutations that must roll back together).
 *
 * Example:
 *   const lot = await withDisplayIdRetry(async () => {
 *     const displayId = await nextDisplayId(prisma.harvestLot, 'HL')
 *     return prisma.harvestLot.create({ data: { displayId, ... } })
 *   })
 */
export async function withDisplayIdRetry<T>(
  attempt: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await attempt()
    } catch (err) {
      if (!isDisplayIdConflict(err)) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Display ID allocation failed after retries')
}
