import prisma from '@/lib/prisma'
import { requireOwnership, requireRole, type AuthenticatedUser } from '@/lib/middleware'
import { parseStrictDateOnly, parseStrictNumber, todayDateOnly } from '@/lib/utils'
import type { SaleTx } from '@/lib/saleOrders'

const DAY_MS = 24 * 60 * 60 * 1000

/** One drying reading as it is stored. */
export interface DryingLogFields {
  date: Date
  moistureContent: number
  ambientTemp: number
  relativeHumidity: number
}

export type DryingLogInput =
  | { ok: true; data: Partial<DryingLogFields> }
  | { ok: false; error: string }

const FIELD_LABELS = {
  moistureContent: 'Moisture content',
  ambientTemp: 'Ambient temperature',
  relativeHumidity: 'Relative humidity',
} as const

type NumberField = keyof typeof FIELD_LABELS

// Moisture and humidity are percentages. The temperature only has to be a
// plausible outdoor reading, so a typo such as 280 is caught.
const RANGES: Record<NumberField, [number, number]> = {
  moistureContent: [0, 100],
  ambientTemp: [-20, 60],
  relativeHumidity: [0, 100],
}

/**
 * Reads a drying reading from a request body. `partial` (an edit) takes
 * only the fields given; otherwise all four are required.
 *
 * A picked YYYY-MM-DD is stored at 12:00 UTC (parseDateOnly's anchor), not
 * 00:00 UTC, so it reads as the same day in every timezone. 2026-02-30 is
 * refused, not rolled over, and a reading cannot be dated after today (a
 * day of slack covers clients ahead of Thai time).
 */
export function parseDryingLogInput(
  body: unknown,
  { partial }: { partial: boolean },
): DryingLogInput {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const data: Partial<DryingLogFields> = {}
  const given = (key: string) =>
    input[key] !== undefined && input[key] !== null && input[key] !== ''

  if (!partial) {
    const missing = ['date', ...Object.keys(FIELD_LABELS)].some((key) => !given(key))
    if (missing) {
      return {
        ok: false,
        error: 'Date, moisture content, ambient temperature, and relative humidity are required',
      }
    }
  }

  if (input.date !== undefined) {
    const date = parseStrictDateOnly(input.date)
    if (!date || Number.isNaN(date.getTime())) {
      return { ok: false, error: 'Date must be a valid date' }
    }
    if (date.getTime() > todayDateOnly().getTime() + DAY_MS) {
      return { ok: false, error: 'The reading date cannot be in the future' }
    }
    data.date = date
  }

  for (const key of Object.keys(FIELD_LABELS) as NumberField[]) {
    if (input[key] === undefined) continue
    const value = parseStrictNumber(input[key])
    if (value === null) {
      return { ok: false, error: `${FIELD_LABELS[key]} must be a valid number` }
    }
    const [min, max] = RANGES[key]
    if (value < min || value > max) {
      return { ok: false, error: `${FIELD_LABELS[key]} must be between ${min} and ${max}` }
    }
    data[key] = value
  }

  if (partial && Object.keys(data).length === 0) {
    return { ok: false, error: 'Nothing to update' }
  }
  return { ok: true, data }
}

/**
 * The batch a drying log belongs to, after checking the caller may change
 * its readings: a Processor on their own batch, or an Admin on any. Returns
 * null when the batch does not exist.
 */
export async function loadBatchForDryingLogs(user: AuthenticatedUser, batchId: string) {
  requireRole(user, ['Processor', 'Admin'])
  const batch = await prisma.processingBatch.findUnique({
    where: { id: batchId },
    select: { id: true, createdById: true },
  })
  if (!batch) return null
  requireOwnership(user, batch.createdById, ['Admin'])
  return batch
}

/**
 * Moves the batch's updatedAt, inside the transaction that changes one of its
 * readings. data-version stamps the batch list by updatedAt and row count, and
 * a reading is not a batch row, so without this other sessions never learn to
 * reload the readings. False when the batch is gone.
 */
export async function touchBatch(tx: SaleTx, batchId: string): Promise<boolean> {
  const { count } = await tx.processingBatch.updateMany({
    where: { id: batchId },
    data: { updatedAt: new Date() },
  })
  return count > 0
}
