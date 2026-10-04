import prisma from '@/lib/prisma'
import { AI_RATE_LIMIT } from '@/lib/aiFeatures'

/**
 * Counts one AI call against the user's limit (AI_RATE_LIMIT) on their User
 * row, so every server instance shares the count: lib/rateLimit counts per
 * instance, and on Vercel one user's requests spread over several.
 *
 * One guarded UPDATE, so calls racing on several instances cannot pass the
 * limit together (Postgres re-checks the WHERE against a row another call
 * just changed). It starts a new window when the last one is over, adds to
 * the current one while it is under the limit, and changes nothing once the
 * limit is reached. Raw SQL, so User.updatedAt (which /api/data-version
 * watches) does not move. The times go in as UTC, the way Prisma stores
 * DateTime columns. Columns from prisma/sql/006_ai_rate_limit.sql.
 *
 * Returns whether the call may go ahead.
 */
export async function takeAiCall(userId: string, now: Date = new Date()): Promise<boolean> {
  const startedAt = now.toISOString()
  const windowOpenedAfter = new Date(now.getTime() - AI_RATE_LIMIT.windowMs).toISOString()
  const counted = await prisma.$executeRaw`
    UPDATE "User"
    SET
      "aiWindowCalls" = CASE
        WHEN "aiWindowStartedAt" IS NULL OR "aiWindowStartedAt" <= (${windowOpenedAfter}::timestamptz AT TIME ZONE 'UTC') THEN 1
        ELSE COALESCE("aiWindowCalls", 0) + 1
      END,
      "aiWindowStartedAt" = CASE
        WHEN "aiWindowStartedAt" IS NULL OR "aiWindowStartedAt" <= (${windowOpenedAfter}::timestamptz AT TIME ZONE 'UTC') THEN (${startedAt}::timestamptz AT TIME ZONE 'UTC')
        ELSE "aiWindowStartedAt"
      END
    WHERE "id" = ${userId}
      AND (
        "aiWindowStartedAt" IS NULL
        OR "aiWindowStartedAt" <= (${windowOpenedAfter}::timestamptz AT TIME ZONE 'UTC')
        OR COALESCE("aiWindowCalls", 0) < ${AI_RATE_LIMIT.max}::integer
      )`
  return counted > 0
}
