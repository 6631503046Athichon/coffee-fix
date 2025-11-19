import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Get origin from request
  const origin = request.headers.get('origin')
  
  // Allowed origins (for production, add your frontend domain)
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    process.env.FRONTEND_URL,
    'https://coffee-fix.vercel.app',
    'https://coffee-fix-production.vercel.app',
    'https://*.vercel.app',
    'https://*.railway.app',
  ].filter(Boolean) as string[]
  
  // Check if origin matches wildcard pattern
  const isOriginAllowed = (origin: string | null): boolean => {
    if (!origin) return false
    if (allowedOrigins.includes(origin)) return true
    // Check wildcard patterns
    if (origin.includes('.vercel.app') || origin.includes('.railway.app')) {
      return true
    }
    return false
  }

  // Use origin if it's in allowed list, otherwise use the first allowed origin or origin from request
  const allowedOrigin = origin && isOriginAllowed(origin)
    ? origin 
    : (allowedOrigins[0] || origin || '*')

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400', // 24 hours
      },
    })
  }

  // Handle actual requests - clone response and add CORS headers
  const response = NextResponse.next()

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version')

  return response
}

// Apply middleware to API routes only
export const config = {
  matcher: '/api/:path*',
}
