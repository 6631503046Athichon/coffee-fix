import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Build an exact-match allowlist of permitted browser origins.
//
// We used to substring-match `.vercel.app` / `.railway.app`, which let any
// attacker-controlled subdomain (e.g. `https://evil.vercel.app`) reflect off
// our CORS headers with credentials enabled. That's a credential-theft hole.
// Switching to an exact-match `Set` driven by env vars closes it.
const ALLOWED_ORIGINS: Set<string> = new Set(
  [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_FRONTEND_URL,
  ].filter((o): o is string => typeof o === 'string' && o.length > 0),
)

const isOriginAllowed = (origin: string | null): boolean => {
  if (!origin) return false
  return ALLOWED_ORIGINS.has(origin)
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')

  // Only echo origins we explicitly trust. Otherwise echo nothing so the
  // browser's same-origin policy blocks the response.
  const allowedOrigin = origin && isOriginAllowed(origin) ? origin : ''

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    }
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin
    }
    return new NextResponse(null, { status: 200, headers })
  }

  // Handle actual requests - clone response and add CORS headers
  const response = NextResponse.next()

  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  }
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  )
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
  )

  return response
}

// Apply middleware to API routes only
export const config = {
  matcher: '/api/:path*',
}
