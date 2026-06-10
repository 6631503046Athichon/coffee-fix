import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { hashPassword, generateToken } from '@/lib/auth'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { validateBody, createUserSchema } from '@/lib/validations'

// Tighten the shared createUserSchema for the admin-register endpoint:
//   - require a password (createUserSchema makes it optional for auto-gen
//     flows; this endpoint always stores what the admin sent)
//   - constrain roles to the Prisma `UserRole` enum literally, so callers
//     can't smuggle in invented role strings that pass the Zod array check
//     but blow up downstream / grant unintended access
//
// TODO(security): Admin-issued passwords here only require min=6 with no
// character-class checks, while reset-password / first-login-update / change
// flows use the centralized `passwordSchema` (min=12 + uppercase + lowercase
// + digit). The looser rule here is preserved because:
//   1. `mustChangePassword: true` below forces the user to set their own
//      strong password on first login (which DOES go through passwordSchema),
//   2. tests in __tests__/registration-lockdown.test.ts pin both the success
//      case ('password123', no uppercase) and the error message ('Password
//      must be at least 6 characters'). Tightening here would break them.
// For new deployments without that test contract, switch this to
// `passwordSchema` from `@/lib/validations/user`.
const registerBodySchema = z.object({
  ...createUserSchema.shape,
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
  roles: z
    .array(z.nativeEnum(UserRole))
    .min(1, 'At least one role is required'),
})

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 registrations per hour per IP (defense-in-depth even though admin-only)
    const limited = await rateLimit(request, RATE_LIMITS.REGISTER)
    if (limited) return limited

    // SECURITY: Only admins can register new users
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const validation = await validateBody(request, registerBodySchema)
    if (!validation.success) {
      return validation.error
    }

    const { name, email, username, password, roles } = validation.data

    if (!email && !username) {
      return NextResponse.json(
        { error: 'Email or username is required' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          username ? { username } : {},
        ].filter((obj) => Object.keys(obj).length > 0),
      },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email or username already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email: email || null,
        username: username || null,
        password: hashedPassword,
        name,
        roles,
        isActive: true,
        mustChangePassword: true, // Force password change on first login
        isSuperAdmin: false, // Never allow registration as super admin
      },
    })

    // Generate token for the httpOnly cookie below.
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email || undefined,
      username: newUser.username || undefined,
      roles: newUser.roles,
    })

    // Build response. The token is intentionally NOT in the JSON body —
    // it lives only in the httpOnly cookie set below, so a successful XSS
    // can't read it from `document.cookie` or JS-accessible storage.
    const response = NextResponse.json(
      {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
          roles: newUser.roles,
          isActive: newUser.isActive,
          isSuperAdmin: newUser.isSuperAdmin,
          mustChangePassword: newUser.mustChangePassword,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        },
        message: 'Registration successful',
      },
      { status: 201 }
    )

    // Set HTTP-only cookie. maxAge matches JWT_EXPIRES_IN ('24h') in
    // lib/auth.ts — keeping them aligned means the cookie doesn't outlive the
    // token it carries (which would just lead to confusing 401s after expiry).
    const isProduction = process.env.NODE_ENV === 'production'
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 60 * 60 * 24, // 24h, matches JWT_EXPIRES_IN
      path: '/',
    })

    return response
  } catch (error) {
    return handleApiError(error)
  }
}
