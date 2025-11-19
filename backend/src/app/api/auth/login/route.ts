import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { hashPassword, verifyPassword, generateToken } from '@/lib/auth'
import { handleApiError } from '@/lib/middleware'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

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
    // For cross-domain (frontend and backend on different domains), use 'none' with secure
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL || !!process.env.RAILWAY_ENVIRONMENT
    const origin = request.headers.get('origin') || ''
    const isCrossDomain = !!(origin && !origin.includes('localhost'))
    const shouldUseSecure = isProduction || isCrossDomain
    
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: shouldUseSecure, // Must be true for sameSite: 'none' or cross-domain
      sameSite: shouldUseSecure ? 'none' : 'lax', // 'none' for cross-domain, 'lax' for same domain
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (error) {
    return handleApiError(error)
  }
}

