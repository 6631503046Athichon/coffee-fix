import prisma from '@/lib/prisma'
import { todayDateOnly } from '@/lib/utils'

/**
 * Crop years run from 1 October to 30 September. The app keeps three on
 * hand (previous, current and next) so the year chips always offer the
 * current one and new lots are filed under it.
 */
export interface CropYearSpec {
  year: string
  startDate: Date
  endDate: Date
}

/**
 * The previous, current and next crop years on `now`'s Thai calendar date.
 * The server runs on UTC, where 00:00-07:00 on 1 October in Bangkok is still
 * 30 September, so the UTC date would roll over seven hours late.
 */
export function cropYearsAround(now: Date = new Date()): CropYearSpec[] {
  const today = todayDateOnly(now)
  const year = today.getUTCFullYear()
  // getUTCMonth is 0-based: 9 is October.
  const currentStart = today.getUTCMonth() >= 9 ? year : year - 1

  return [-1, 0, 1].map(offset => {
    const startYear = currentStart + offset
    const endYear = startYear + 1
    return {
      year: `${startYear}/${endYear}`,
      // The same midnight-UTC dates the existing rows have always had.
      startDate: new Date(`${startYear}-10-01`),
      endDate: new Date(`${endYear}-09-30`),
    }
  })
}

/** Which of the previous, current and next crop years `existing` lacks. */
export function missingCropYears(
  existing: { year: string }[],
  now: Date = new Date()
): CropYearSpec[] {
  const have = new Set(existing.map(cropYear => cropYear.year))
  return cropYearsAround(now).filter(spec => !have.has(spec.year))
}

/**
 * Create whichever of the previous, current and next crop years is missing.
 * Idempotent. An existing row is left exactly as it is: an Admin may have
 * edited its dates or description (PUT /api/crop-years/:id), and the old
 * "Previous / Current / Next" labels went stale the day the year rolled over.
 */
export async function ensureCropYears(now: Date = new Date()) {
  return Promise.all(
    cropYearsAround(now).map(spec =>
      prisma.cropYear.upsert({
        where: { year: spec.year },
        update: {},
        create: { ...spec, description: `Crop year ${spec.year}` },
      })
    )
  )
}

export interface CropYearRow {
  id: string
  year: string
  description: string | null
}

// The label the old route wrote, and rewrote on every call, for the row's
// own year. It went stale the day the year rolled over ("Next crop year
// 2026/2027" on the current year) and nothing writes it any more.
const OLD_AUTO_DESCRIPTION = /^(?:Previous|Current|Next) crop year (\d{4}\/\d{4})$/

/** The row still carries the old route's auto label for its own year. */
export function hasOldAutoDescription(row: Pick<CropYearRow, 'year' | 'description'>): boolean {
  return OLD_AUTO_DESCRIPTION.exec(row.description ?? '')?.[1] === row.year
}

/**
 * Bring the crop years up to date from the rows already loaded: create the
 * missing previous / current / next year, and replace any old auto label
 * with the plain "Crop year YYYY/YYYY". A row is relabelled only while it
 * still holds that exact label, so a description an Admin wrote in the
 * meantime is kept; dates are never touched. When nothing needs doing it
 * writes nothing. Returns whether it wrote, so the caller can list again.
 */
export async function upkeepCropYears(
  existing: CropYearRow[],
  now: Date = new Date()
): Promise<boolean> {
  const missing = missingCropYears(existing, now).length > 0
  const stale = existing.filter(hasOldAutoDescription)
  if (!missing && stale.length === 0) return false

  if (missing) await ensureCropYears(now)
  await Promise.all(
    stale.map(row =>
      prisma.cropYear.updateMany({
        where: { id: row.id, description: row.description },
        data: { description: `Crop year ${row.year}` },
      })
    )
  )
  return true
}
