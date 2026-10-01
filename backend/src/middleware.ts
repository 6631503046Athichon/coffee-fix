import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRequestContentType, checkRequestOrigin } from '@/lib/csrf'

// Build an exact-match allowlist of permitted browser origins.
//
// We used to substring-match `.vercel.app` / `.railway.app`, which let any
// attacker-controlled subdomain (e.g. `https://evil.vercel.app`) reflect off
// our CORS headers with credentials enabled. That's a credential-theft hole.
// Switching to an exact-match `Set` driven by env vars closes it.
const ALLOWED_ORIGINS: Set<string> = new Set(
  [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_FRONTEND_URL,
  ].filter((o): o is string => typeof o === 'string' && o.length > 0),
)

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false
  return ALLOWED_ORIGINS.has(origin)
}

const ALLOW_METHODS = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
const ALLOW_HEADERS =
  'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version'

function applyCorsHeaders(response: NextResponse, allowedOrigin: string): NextResponse {
  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  }
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS)
  response.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS)
  return response
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')

  // Only echo origins we explicitly trust. Otherwise echo nothing so the
  // browser's same-origin policy blocks the response.
  const allowedOrigin = origin && isOriginAllowed(origin) ? origin : ''

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    }
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin
    }
    return new NextResponse(null, { status: 200, headers })
  }

  // CSRF: refuse state-changing requests another site made the browser send,
  // and bodies that aren't declared JSON (see lib/csrf.ts). Rejections still
  // carry the CORS headers so an allowed origin can read the error.
  const rejected = checkRequestOrigin(request) ?? checkRequestContentType(request)
  if (rejected) {
    return applyCorsHeaders(rejected, allowedOrigin)
  }

  // Handle actual requests - clone response and add CORS headers
  return applyCorsHeaders(NextResponse.next(), allowedOrigin)
}

// Apply middleware to API routes only
export const config = {
  matcher: '/api/:path*',
}
