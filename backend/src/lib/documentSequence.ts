import prisma from './prisma'

/**
 * Anything that can run a tagged `$queryRaw`: the app's client, or the
 * client a `prisma.$transaction` callback gets.
 */
export type SequenceClient = {
  $queryRaw: (query: TemplateStringsArray, ...values: any[]) => PromiseLike<unknown>
}

/**
 * Reserve `count` numbers of the document series `key` ("HL-2026",
 * "ORD-2026") and return the first one. The block is
 * `[first, first + count - 1]`.
 *
 * The last number handed out is kept in "DocumentSequence"
 * (prisma/sql/009_document_sequences.sql), so a number is never handed out
 * twice, not even after the record that had it was deleted. Counting on from
 * the highest number still in the table (the old way) gave a deleted lot's
 * number to the next lot, so two printed labels carried one number.
 *
 * `floor` is the highest number of the series that exists in the real table.
 * The counter never goes below it, so a series with no counter row yet, or
 * one whose rows were written without it, continues after the existing
 * numbers instead of colliding with them (no backfill needed).
 *
 * One INSERT ... ON CONFLICT DO UPDATE, so callers racing on several server
 * instances each get their own block: Postgres locks the counter row for the
 * update, and a second caller sees the first one's new value. It goes
 * through the query engine, so it works over the Supabase pooler. Pass `db`
 * to allocate inside a transaction; a rolled-back transaction then gives the
 * numbers back, which is fine because nothing kept them.
 *
 * __tests__/helpers/memoryPrisma recognises this statement and reads its
 * first three parameters as key, floor and count. Keep that order.
 */
export async function reserveSequence(
  key: string,
  floor: number,
  count = 1,
  db: SequenceClient = prisma,
): Promise<number> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`reserveSequence: count must be a positive integer, got ${count}`)
  }
  const safeFloor = Number.isInteger(floor) && floor > 0 ? floor : 0

  const rows = (await db.$queryRaw`
    INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
    VALUES (${key}, ${safeFloor}::integer + ${count}::integer, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT ("key") DO UPDATE
    SET "lastValue" = GREATEST("DocumentSequence"."lastValue", ${safeFloor}::integer) + ${count}::integer,
        "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "lastValue"`) as { lastValue: number | bigint }[]

  const last = Number(rows?.[0]?.lastValue)
  if (!Number.isInteger(last)) {
    throw new Error(`reserveSequence: no number came back for ${key}`)
  }
  return last - count + 1
}
