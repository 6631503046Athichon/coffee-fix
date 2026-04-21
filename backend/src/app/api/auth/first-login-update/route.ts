import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import bcrypt from 'bcryptjs'

/**
 * POST /api/auth/first-login-update
 * Update user credentials on first login
 * Allows changing username, email, and password
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 first-login updates per 15 minutes per IP
    const limited = await rateLimit(request, RATE_LIMITS.FIRST_LOGIN)
    if (limited) return limited

    // SECURITY: Use requireAuth instead of manual token extraction
    const currentUser = await requireAuth(request)

    // Get full user details
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get update data from request
    const { currentPassword, newUsername, newEmail, newPassword } = await request.json()

    // Verify current password
    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required' },
        { status: 400 }
      )
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      )
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
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 400 }
        )
      }

      updateData.username = newUsername
      updateData.mustChangeUsername = false
    }

    // Update email if provided and required
    if (user.mustChangeEmail && newEmail) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newEmail)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        )
      }

      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email: newEmail }
      })

      if (existingEmail && existingEmail.id !== user.id) {
        return NextResponse.json(
          { error: 'Email already taken' },
          { status: 400 }
        )
      }

      updateData.email = newEmail
      updateData.mustChangeEmail = false
    }

    // Update password if provided and required
    if (user.mustChangePassword && newPassword) {
      // Validate password strength
      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters long' },
          { status: 400 }
        )
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10)
      updateData.password = hashedPassword
      updateData.mustChangePassword = false
    }

    // Ensure all required changes are made
    if (user.mustChangeUsername && !newUsername) {
      return NextResponse.json(
        { error: 'Username change is required' },
        { status: 400 }
      )
    }

    if (user.mustChangeEmail && !newEmail) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (user.mustChangePassword && !newPassword) {
      return NextResponse.json(
        { error: 'Password change is required' },
        { status: 400 }
      )
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData
    })

    return NextResponse.json({
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

  } catch (error) {
    return handleApiError(error)
  }
}
