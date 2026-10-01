import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// CSRF guard for the API, run by src/middleware.ts before any route.
//
// The SPA never calls this backend cross-site: frontend/vercel.json rewrites
// /api/* on the frontend host to this deployment (and the Vite dev proxy does
// the same locally), so the auth cookie is first-party to the frontend host.
// What a browser will still do is attach that cookie to a request some other
// site *triggers* — a hidden form POST, a no-cors fetch. These checks refuse
// such requests before they reach a route.

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Origins only a developer's machine produces. Trusted outside production.
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]

// Routes whose body is legitimately not JSON, and the media types they take.
// Every other route reads JSON, so every other body must be declared JSON.
const NON_JSON_BODY_ROUTES: Record<string, string[]> = {
  '/api/parchment-lots/import-excel': ['multipart/form-data'],
}

/**
 * Reduce a URL or Origin header to its origin (`scheme://host[:port]`), so an
 * env value with a trailing slash or a path still matches. Returns null for
 * anything that isn't a real origin, including the opaque `null` origin.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const origin = new URL(value.trim()).origin
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/**
 * Origins allowed to send state-changing requests: the configured frontend
 * URLs, this backend itself, and the local dev servers outside production.
 * Read per request so it always reflects the current environment.
 */
export function getTrustedOrigins(selfOrigin: string): Set<string> {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_FRONTEND_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    selfOrigin,
  ]
  if (process.env.NODE_ENV !== 'production') candidates.push(...DEV_ORIGINS)

  const trusted = new Set<string>()
  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate)
    if (origin) trusted.add(origin)
  }
  return trusted
}

function mediaType(contentType: string | null): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase()
}

/** True for `application/json` and structured `application/*+json` types. */
export function isJsonContentType(contentType: string | null): boolean {
  const type = mediaType(contentType)
  return (
    type === 'application/json' ||
    (type.startsWith('application/') && type.endsWith('+json'))
  )
}

/**
 * Refuse a state-changing request another site made the browser send.
 *
 * - `Sec-Fetch-Site: cross-site` is refused outright. The SPA's own calls are
 *   same-origin through the rewrite, so nothing legitimate arrives cross-site.
 * - `Sec-Fetch-Site: same-origin` passes. The browser is vouching that the
 *   page shares an origin with the URL it fetched — through the rewrite that
 *   URL is the frontend host, so the Origin may name a host this deployment
 *   never listed (a preview URL, or localhost:5173 proxying to production).
 *   No other site can produce that pair.
 * - Otherwise an Origin header, when present, must be a trusted origin.
 * - No Origin and no Sec-Fetch-Site means no browser is involved (curl,
 *   server-to-server, cron): there is no ambient cookie to abuse, so it passes.
 */
export function checkRequestOrigin(request: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(request.method)) return null

  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') return forbidden()
  if (fetchSite === 'same-origin') return null

  const origin = request.headers.get('origin')
  if (origin === null) return null

  const normalized = normalizeOrigin(origin)
  if (normalized && getTrustedOrigins(request.nextUrl.origin).has(normalized)) {
    return null
  }
  return forbidden()
}

/**
 * Refuse a state-changing request whose body isn't declared JSON. A cross-site
 * HTML form can only send urlencoded, multipart or text/plain, and a request
 * the browser sends without a CORS preflight can't claim application/json —
 * so JSON routes accept nothing else. Routes in NON_JSON_BODY_ROUTES (file
 * uploads) also take their own media type. A request with no body passes.
 */
export function checkRequestContentType(request: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(request.method)) return null

  const contentType = request.headers.get('content-type')
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) === 0) return null

  if (contentType === null) {
    // Nothing declares a body, so there is nothing for a route to parse.
    if (contentLength === null && !request.headers.has('transfer-encoding')) {
      return null
    }
    return unsupportedMediaType()
  }

  if (isJsonContentType(contentType)) return null

  const path = request.nextUrl.pathname.replace(/\/+$/, '')
  const allowed = NON_JSON_BODY_ROUTES[path]
  if (allowed && allowed.includes(mediaType(contentType))) return null

  return unsupportedMediaType()
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: 'Cross-site request blocked' },
    { status: 403 },
  )
}

export function unsupportedMediaType(): NextResponse {
  return NextResponse.json(
    {
      error: 'Unsupported Media Type',
      message: 'Request body must be JSON (Content-Type: application/json)',
    },
    { status: 415 },
  )
}
