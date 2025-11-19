import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: 'Logout successful' })

  // Clear auth cookie
  const isProduction = process.env.NODE_ENV === 'production'
  response.cookies.set('auth-token', '', {
    httpOnly: true,
    secure: isProduction, // Must be true for sameSite: 'none'
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-domain, 'lax' for same domain
    maxAge: 0,
    path: '/',
  })

  return response
}

