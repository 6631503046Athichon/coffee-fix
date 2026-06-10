import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyPassword, generateToken } from '@/lib/auth'
import { handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit'
import { validateBody, loginSchema } from '@/lib/validations'

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 login attempts per 15 minutes per (IP + email) combo.
    //
    // Keying on IP alone causes every user sharing an egress IP (office NAT,
    // ISP CG-NAT, or a dev environment without `x-forwarded-for` where
    // getClientIp() returns 'anonymous') to collide in a single bucket, so
    // one person mistyping their password five times locks out everyone
    // else on that IP. Combining IP with the submitted email gives each
    // account its own window per IP — an attacker spraying many emails from
    // one IP still can't exhaust a legitimate user's allowance, while brute
    // forcing a single account stays capped at 5/15min as before.
    //
    // We read email from a cloned body so `validateBody()` below can still
    // consume the original stream and produce the authoritative 400 error
    // on malformed input.
    let emailForRateLimit = ''
    try {
      const cloned = (await request.clone().json()) as unknown
      if (
        cloned &&
        typeof cloned === 'object' &&
        'email' in cloned &&
        typeof (cloned as { email: unknown }).email === 'string'
      ) {
        emailForRateLimit = (cloned as { email: string }).email.trim().toLowerCase()
      }
    } catch {
      // Malformed JSON or empty body — fall back to IP-only keying.
      // validateBody() below will surface the proper 400 error.
    }

    const limited = await rateLimit(request, {
      ...RATE_LIMITS.LOGIN,
      keyFn: (req) => `${getClientIp(req)}:${emailForRateLimit}`,
    })
    if (limited) return limited

    // Second bucket: IP-only at 50 / 15min. The per-(IP+email) bucket above
    // is intentionally permissive so legitimate users on a shared NAT aren't
    // locked out, but that leaves credential-stuffing wide open — an attacker
    // can hit `attempts × accounts` requests from one IP without tripping it.
    // This coarse IP-only ceiling caps the total damage one IP can do across
    // all accounts in the window.
    const ipLimited = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      max: 50,
      name: 'login-ip',
      keyFn: (req) => getClientIp(req),
    })
    if (ipLimited) return ipLimited

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
    // Note: token is intentionally NOT returned in the body. The httpOnly
    // cookie set below is the only place the browser should see it — keeping
    // it out of JS-readable storage avoids XSS-driven token exfiltration.
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
    // Log full error for debugging 500 errors. Stack traces are noisy and
    // can leak filesystem paths / sensitive frames to log aggregators — only
    // emit them outside production.
    console.error('[LOGIN] Error:', error)
    if (error instanceof Error) {
      console.error('[LOGIN] Error message:', error.message)
      if (process.env.NODE_ENV !== 'production') {
        console.error('[LOGIN] Error stack:', error.stack)
      }
    }
    return handleApiError(error)
  }
}

