// Type-only: the counter (and with it the Prisma client) is loaded only when
// a number is taken, so the plain helpers here stay free of runtime imports.
import type { SequenceClient } from './documentSequence'

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
 * Parse a "calendar-date" input (YYYY-MM-DD) into a Date that displays as
 * the same calendar date in every realistic timezone.
 *
 * Background: `new Date('2026-04-25')` is parsed as 2026-04-25T00:00:00 UTC.
 * In a negative-offset timezone (e.g. UTC-08 in Los Angeles) that instant
 * displays as 2026-04-24 16:00 — the picked date rolls back a day. Anchoring
 * the instant at 12:00 UTC instead means ±11h shifts (covering every
 * coffee-growing region from -11 to +11) still land on the same calendar
 * date, so the date the operator picked is the date everyone reads.
 *
 * For inputs that already include a time component (full ISO datetime),
 * we pass them through to preserve the caller's intent.
 *
 * Returns null for null/undefined/empty inputs and an `Invalid Date` for
 * unparseable strings — callers should reject `Number.isNaN(d.getTime())`.
 */
export function parseDateOnly(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const s = typeof value === 'string' ? value : String(value)
  // YYYY-MM-DD: anchor at 12:00 UTC so ±11h timezones display same date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00.000Z`)
  }
  return new Date(s)
}

/**
 * Strict number parsing for money inputs. Accepts a finite number, or a
 * string holding only a plain decimal number ("150", "-3", "180.25").
 * Unlike safeParseFloat, "150abc", [150], true and "0x10" all give null.
 */
export function parseStrictNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * parseDateOnly, but a date that is not a real calendar day (2026-02-30)
 * comes back as an Invalid Date instead of silently rolling over to
 * March 2. Applies to plain YYYY-MM-DD and to the date part of an ISO
 * datetime.
 */
export function parseStrictDateOnly(value: unknown): Date | null {
  const parsed = parseDateOnly(value)
  if (!parsed || Number.isNaN(parsed.getTime())) return parsed
  const match = /^(\d{4})-(\d{2})-(\d{2})(T|$)/.exec(String(value))
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
    const check = new Date(Date.UTC(y, m - 1, d))
    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== m - 1 ||
      check.getUTCDate() !== d
    ) {
      return new Date(NaN)
    }
  }
  return parsed
}

// The business runs on Thai time; Railway servers run on UTC.
const BUSINESS_TIME_ZONE = 'Asia/Bangkok'

/**
 * Today's calendar date in the business timezone, anchored at 12:00 UTC
 * exactly like a picked date from parseDateOnly. Use it for dates the
 * server stamps itself (e.g. "price set today"), so a record made at
 * 03:00 Thai time is not read back as the previous (UTC) day.
 */
export function todayDateOnly(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00.000Z`)
}

/**
 * The current year in the business timezone. On a UTC server,
 * new Date().getFullYear() is still last year on 1 January until 07:00
 * Thai time.
 */
export function businessYear(now: Date = new Date()): number {
  return todayDateOnly(now).getUTCFullYear()
}

/**
 * The highest N among this year's `PREFIX-YEAR-N` ids in the table (0 when
 * there are none): the floor the document counter never goes below.
 *
 * IMPLEMENTATION NOTE: a `findFirst({ orderBy: { displayId: 'desc' } })`
 * fast path would let Postgres pick the max via index, but only if the
 * numeric suffix is fixed-width zero-padded (e.g. `HL-2026-0007`). Current
 * production data and the `__tests__/display-id.test.ts` contract both use
 * unpadded suffixes (`HL-2026-7`), where lexical desc order returns `-9`
 * before `-10`. Leaving the linear scan in place is correct; revisit if the
 * table grows past ~10k rows per year per prefix.
 */
async function highestDisplayNumber(
  model: { findMany: (args: any) => Promise<any[]> },
  yearPrefix: string,
): Promise<number> {
  const items = await model.findMany({
    where: { displayId: { startsWith: yearPrefix } },
    select: { displayId: true },
  })

  let maxNum = 0
  for (const item of items) {
    const num = parseInt((item.displayId as string).replace(yearPrefix, ''))
    if (!isNaN(num) && num > maxNum) maxNum = num
  }
  return maxNum
}

/**
 * Generate the next sequential displayId for a given prefix.
 * Format: {PREFIX}-{YEAR}-{NUMBER} e.g. HL-2026-1, PB-2026-2, in the current
 * year (Thai time, see businessYear).
 *
 * The number comes from the persistent counter (lib/documentSequence), so it
 * is never handed out twice: deleting HL-2026-8 and creating a lot gives
 * HL-2026-9, not a second HL-2026-8. The counter never goes below the
 * highest number in `model`'s table, so it carries on from existing data.
 *
 * Pass `db` (a `$transaction` client) to allocate inside that transaction;
 * by default it allocates on its own, committed at once.
 *
 * The `displayId` column stays `@unique`, so a row written without the
 * counter (e.g. by an old server during a deploy) still makes the insert fail
 * with P2002 rather than duplicate it. Wrap the `nextDisplayId` + `create`
 * pair in `withDisplayIdRetry` so the caller takes a fresh number and retries.
 */
export async function nextDisplayId(
  model: { findMany: (args: any) => Promise<any[]> },
  prefix: string,
  db?: SequenceClient,
): Promise<string> {
  const [displayId] = await nextDisplayIds(model, prefix, 1, db)
  return displayId
}

/**
 * Allocate N sequential displayIds at once, e.g. for a HullAndGrade
 * withdrawal that creates several green-bean lots in one transaction.
 *
 * Reserves the whole block `[n, n+1, ..., n+count-1]` with one counter
 * statement (and one read of the table's highest number), so a concurrent
 * allocator gets numbers after the block, never inside it.
 *
 * Pair with `withDisplayIdRetry` to handle rows written without the counter.
 */
export async function nextDisplayIds(
  model: { findMany: (args: any) => Promise<any[]> },
  prefix: string,
  count: number,
  db?: SequenceClient,
): Promise<string[]> {
  if (count <= 0) return []
  const year = businessYear()
  const yearPrefix = `${prefix}-${year}-`

  const floor = await highestDisplayNumber(model, yearPrefix)
  const { reserveSequence } = await import('./documentSequence')
  const first = await reserveSequence(`${prefix}-${year}`, floor, count, db)

  return Array.from({ length: count }, (_, i) => `${yearPrefix}${first + i}`)
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
 * insert collides with an existing row (Prisma P2002 on `displayId`, e.g. one
 * written without the counter), retry up to `maxRetries` times — each retry
 * takes a fresh number from the counter, which also re-reads the table's
 * highest number, so it lands past the row it hit.
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
