/**
 * Server-side Gemini client for the /api/ai/* routes.
 *
 * The key lives only in the backend env (GEMINI_API_KEY). It travels to
 * Google in the `x-goog-api-key` header, never in a URL, and it is never
 * logged or put in a response. Gemini's own error bodies are not read or
 * forwarded either: callers only learn which kind of failure happened.
 */

export const GEMINI_MODEL = 'gemini-2.5-flash'

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/**
 * Below the SPA's 30 s request timeout (services/api.ts), so the browser gets
 * our 504 instead of giving up on the backend.
 */
export const GEMINI_TIMEOUT_MS = 25_000

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

export interface GeminiRequest {
  parts: GeminiPart[]
  /** Gemini's generationConfig: temperature, responseSchema and so on. */
  generationConfig: Record<string, unknown>
}

/**
 * - not-configured: GEMINI_API_KEY is not set on the backend
 * - timeout: Gemini did not answer within GEMINI_TIMEOUT_MS
 * - upstream: Gemini refused the request or could not be reached
 * - empty: Gemini answered with no text (blocked or cut off)
 */
export type GeminiFailure = 'not-configured' | 'timeout' | 'upstream' | 'empty'

export class GeminiError extends Error {
  readonly reason: GeminiFailure
  /** Gemini's HTTP status for an `upstream` failure, for the server log. */
  readonly upstreamStatus?: number

  constructor(reason: GeminiFailure, upstreamStatus?: number) {
    super(`Gemini request failed: ${reason}`)
    this.name = 'GeminiError'
    this.reason = reason
    this.upstreamStatus = upstreamStatus
  }
}

/** The configured key, or null when AI is not set up on this deployment. */
export function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null
}

interface GeminiResponseBody {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] }
  }[]
}

/** Send one user turn to Gemini and return the text of its answer. */
export async function generateGeminiText(request: GeminiRequest): Promise<string> {
  const apiKey = geminiApiKey()
  if (!apiKey) throw new GeminiError('not-configured')

  let response: Response
  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: request.parts }],
        generationConfig: request.generationConfig,
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    })
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    throw new GeminiError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'upstream')
  }

  if (!response.ok) {
    throw new GeminiError('upstream', response.status)
  }

  let body: GeminiResponseBody
  try {
    body = (await response.json()) as GeminiResponseBody
  } catch {
    throw new GeminiError('upstream', response.status)
  }

  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
  if (!text.trim()) throw new GeminiError('empty')
  return text
}
