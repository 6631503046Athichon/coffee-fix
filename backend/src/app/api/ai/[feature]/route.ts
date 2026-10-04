import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit } from '@/lib/rateLimit'
import { isJsonContentType, unsupportedMediaType } from '@/lib/csrf'
import { AI_RATE_LIMIT, getAiFeature } from '@/lib/aiFeatures'
import { takeAiCall } from '@/lib/aiRateLimit'
import { generateGeminiText, geminiApiKey, GeminiError } from '@/lib/gemini'

export const dynamic = 'force-dynamic'
// Gemini answers within GEMINI_TIMEOUT_MS (25 s); leave room around it.
export const maxDuration = 30

const tooLarge = () =>
  NextResponse.json({ error: 'Request is too large for this AI feature' }, { status: 413 })

// The shared count tells no reset time; the window is a minute at most.
const RETRY_AFTER_SEC = Math.ceil(AI_RATE_LIMIT.windowMs / 1000)

const tooManyCalls = () =>
  NextResponse.json(
    { error: 'Too many requests. Please try again later.', retryAfter: RETRY_AFTER_SEC },
    { status: 429, headers: { 'Retry-After': String(RETRY_AFTER_SEC) } }
  )

/**
 * POST /api/ai/:feature
 *
 * Runs one of the AI features in lib/aiFeatures (soil-recommendations,
 * soil-image, quality-insights, quality-report) with the backend's
 * GEMINI_API_KEY and answers `{ result }`. The key never reaches the browser,
 * and Gemini's own error text is never passed on.
 *
 * 401 signed out · 403 wrong role · 404 unknown feature · 413 body too big ·
 * 415 not JSON · 400 invalid input · 429 rate limited · 501 AI not set up ·
 * 502 Gemini failed or answered nonsense · 504 Gemini timed out
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ feature: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { feature: featureName } = await params

    const feature = getAiFeature(featureName)
    if (!feature) {
      return NextResponse.json({ error: 'Unknown AI feature' }, { status: 404 })
    }
    requireRole(user, [...feature.roles])

    // Not 503: the SPA retries a 503 and then treats the whole backend as down.
    if (!geminiApiKey()) {
      return NextResponse.json(
        { error: 'AI features are not set up on this server yet' },
        { status: 501 }
      )
    }

    const limited = await rateLimit(request, {
      ...AI_RATE_LIMIT,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited

    if (!isJsonContentType(request.headers.get('content-type'))) {
      return unsupportedMediaType()
    }
    const declaredLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > feature.maxBodyBytes) {
      return tooLarge()
    }
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > feature.maxBodyBytes) {
      return tooLarge()
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Request body must be valid JSON' },
        { status: 400 }
      )
    }

    const prepared = feature.prepare(body)
    if (!prepared.ok) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Request data is invalid',
          details: prepared.error.issues.map((issue) => ({
            field: issue.path.map(String).join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
        { status: 400 }
      )
    }

    // The limit above is counted per server instance. This count, on the
    // user's row, is shared by every instance, and only calls that reach
    // Gemini spend it.
    if (!(await takeAiCall(user.id))) {
      return tooManyCalls()
    }

    let text: string
    try {
      text = await generateGeminiText(prepared.request)
    } catch (error) {
      if (error instanceof GeminiError) {
        console.error(
          `AI ${featureName}: Gemini ${error.reason}`,
          error.upstreamStatus ? `(HTTP ${error.upstreamStatus})` : ''
        )
        if (error.reason === 'not-configured') {
          return NextResponse.json(
            { error: 'AI features are not set up on this server yet' },
            { status: 501 }
          )
        }
        if (error.reason === 'timeout') {
          return NextResponse.json({ error: 'The AI service took too long. Please try again.' }, { status: 504 })
        }
        return NextResponse.json({ error: 'The AI service failed. Please try again.' }, { status: 502 })
      }
      throw error
    }

    let result: unknown
    try {
      result = feature.toResult(text)
    } catch {
      console.error(`AI ${featureName}: Gemini answer could not be read`)
      return NextResponse.json({ error: 'The AI service gave an unreadable answer. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ result })
  } catch (error) {
    return handleApiError(error)
  }
}
