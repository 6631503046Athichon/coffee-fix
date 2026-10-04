import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError, forgetCachedAuth, refreshSessionCookie } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit'
import { firstLoginUpdateSchema } from '@/lib/validations/user'
import bcrypt from 'bcryptjs'

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 })

/**
 * POST /api/auth/first-login-update
 * Update user credentials on first login
 * Allows changing username, email, and password
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Use requireAuth instead of manual token extraction. This is
    // the one write an account that still owes its setup may make.
    const currentUser = await requireAuth(request, { allowSetupPending: true })

    // Rate limit: 10 attempts per 15 minutes per account (and IP). Keyed on
    // the account, not the IP alone: a co-op onboarding a dozen farmers on
    // one Wi-Fi must not share 10 attempts, as each of them is held on the
    // setup page until it succeeds.
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.FIRST_LOGIN,
      keyFn: (req) => `${getClientIp(req)}:${currentUser.id}`,
    })
    if (limited) return limited

    // A looser IP-only ceiling, as login has, so one IP cannot hammer
    // password checks across many sessions.
    const ipLimited = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      max: 50,
      name: 'first-login-ip',
      keyFn: (req) => getClientIp(req),
    })
    if (ipLimited) return ipLimited

    // Get full user details
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest('Invalid JSON body')
    }

    // Same rules as everywhere else: the password policy, and usernames of
    // letters, digits, _ and - only. A username can never hold '@', so it can
    // never equal someone's email and capture their sign-in.
    const parsed = firstLoginUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request')
    }
    const { currentPassword, newUsername, newEmail, newPassword } = parsed.data

    // A wrong password is a 400, not a 401: the client reads any 401 as an
    // expired session and would sign the user out instead of showing this.
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return badRequest('Current password is incorrect')
    }

    // Ensure all required changes are made
    if (user.mustChangeUsername && !newUsername) {
      return badRequest('Username change is required')
    }

    if (user.mustChangeEmail && !newEmail) {
      return badRequest('Email is required')
    }

    if (user.mustChangePassword && !newPassword) {
      return badRequest('Password change is required')
    }

    // Keeping the password the Admin handed out would leave them knowing it.
    if (user.mustChangePassword && newPassword === currentPassword) {
      return badRequest('New password must be different from the current password')
    }

    // Prepare update data
    const updateData: Record<string, string | boolean | Date> = {
      updatedAt: new Date()
    }

    // Update username if provided and required
    if (user.mustChangeUsername && newUsername) {
      // Check if username already exists
      const existingUsername = await prisma.user.findUnique({
        where: { username: newUsername }
      })

      if (existingUsername && existingUsername.id !== user.id) {
        return badRequest('Username already taken')
      }

      updateData.username = newUsername
      updateData.mustChangeUsername = false
    }

    // Update email if provided and required
    if (user.mustChangeEmail && newEmail) {
      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email: newEmail }
      })

      if (existingEmail && existingEmail.id !== user.id) {
        return badRequest('Email already taken')
      }

      updateData.email = newEmail
      updateData.mustChangeEmail = false
    }

    // Update password if provided and required. passwordChangedAt signs out
    // every session started before now; this one gets a fresh cookie below.
    if (user.mustChangePassword && newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10)
      updateData.password = hashedPassword
      updateData.mustChangePassword = false
      updateData.passwordChangedAt = new Date()
    }
    const changesPassword = updateData.password !== undefined

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData
    })
    if (changesPassword) forgetCachedAuth(user.id)

    const response = NextResponse.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        username: updatedUser.username,
        roles: updatedUser.roles,
        isActive: updatedUser.isActive,
        isSuperAdmin: updatedUser.isSuperAdmin,
        mustChangePassword: updatedUser.mustChangePassword,
        mustChangeUsername: updatedUser.mustChangeUsername,
        mustChangeEmail: updatedUser.mustChangeEmail,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      }
    })
    return changesPassword ? refreshSessionCookie(response, updatedUser) : response

  } catch (error) {
    return handleApiError(error)
  }
}
