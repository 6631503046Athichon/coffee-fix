import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { runWeatherSweep } from '@/lib/weatherScheduler'
import { handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

// One sweep walks every auto-fetch farm and may call Open-Meteo for each, so
// the default 10s serverless budget is not enough once a few farms come due
// at the same minute.
export const maxDuration = 60

function isAuthorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  // Fail closed: an unset secret must not mean "open to everyone".
  if (!expected) return false

  const header = request.headers.get('authorization') ?? ''
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (supplied.length !== expected.length) return false

  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

/**
 * GET /api/cron/weather
 *
 * Server-side weather collection for hosts with no long-lived process. On a
 * normal server src/instrumentation.ts starts an interval instead; this route
 * is the serverless equivalent and is meant to be called by an external
 * scheduler roughly every minute:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/weather
 *
 * Calling it more often than needed is harmless — each farm still writes only
 * once per its own weatherAutoFetchInterval.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    // Say nothing about which half was wrong.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const started = Date.now()
    const result = await runWeatherSweep()

    return NextResponse.json({
      status: 'ok',
      ...result,
      durationMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
