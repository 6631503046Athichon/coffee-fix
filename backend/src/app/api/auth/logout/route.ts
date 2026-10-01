import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/authCookie'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: 'Logout successful' })

  // Clear auth cookie with the same attributes login set it with
  response.cookies.set(AUTH_COOKIE_NAME, '', authCookieOptions(0))

  return response
}

