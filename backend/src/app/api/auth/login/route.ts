import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyPassword, generateToken } from '@/lib/auth'
import { handleApiError } from '@/lib/middleware'
import { validateBody, loginSchema } from '@/lib/validations'

export async function POST(request: NextRequest) {
  try {
    // Validate request body with Zod
    const validation = await validateBody(request, loginSchema)
    if (!validation.success) {
      return validation.error
    }

    const { email, password } = validation.data

    // Find user by email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { username: email }, // Allow login with username too
        ],
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'This account is disabled' },
        { status: 403 }
      )
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password)
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email || undefined,
      username: user.username || undefined,
      roles: user.roles,
    })

    // Create response
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        roles: user.roles,
        isActive: user.isActive,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
        mustChangeUsername: user.mustChangeUsername,
        mustChangeEmail: user.mustChangeEmail,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token, // Also include token in response for localStorage fallback
      message: 'Login successful',
    })

    // Set HTTP-only cookie
    // For localhost with different ports, we need to handle it specially
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL || !!process.env.RAILWAY_ENVIRONMENT
    const origin = request.headers.get('origin') || ''
    // Check if frontend and backend are on different ports (localhost:5173 vs localhost:3001)
    const isLocalhostDifferentPort = origin.includes('localhost') && !origin.includes(':3001')
    const isCrossDomain = !!(origin && !origin.includes('localhost'))
    
    // For localhost with different ports, use 'lax' with secure: false
    // For production cross-domain, use 'none' with secure: true
    const shouldUseSecure = isProduction || (isCrossDomain && !isLocalhostDifferentPort)
    const sameSiteValue = (isProduction || isCrossDomain) && !isLocalhostDifferentPort ? 'none' : 'lax'
    
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: shouldUseSecure, // false for localhost, true for production
      sameSite: sameSiteValue, // 'lax' for localhost, 'none' for cross-domain production
      maxAge: 60 * 60 * 24, // 1 day to match JWT 24h expiry
      path: '/',
      // Don't set domain for localhost - let browser handle it
    })

    return response
  } catch (error) {
    // Log full error for debugging 500 errors
    console.error('[LOGIN] Error:', error)
    if (error instanceof Error) {
      console.error('[LOGIN] Error message:', error.message)
      console.error('[LOGIN] Error stack:', error.stack)
    }
    return handleApiError(error)
  }
}

