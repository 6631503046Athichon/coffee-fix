import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 reset attempts per 15 minutes per IP (prevents token brute-force)
    const limited = await rateLimit(request, RATE_LIMITS.RESET_PASSWORD)
    if (limited) return limited

    const body = await request.json()
    const { token, password } = body

    // Validation
    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Find reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: true,
      },
    })

    if (!resetToken) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      )
    }

    // Check if token is used
    if (resetToken.used) {
      return NextResponse.json(
        { error: 'This reset token has already been used' },
        { status: 400 }
      )
    }

    // Check if token is expired
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json(
        { error: 'Reset token has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check if user is active
    if (!resetToken.user.isActive) {
      return NextResponse.json(
        { error: 'Account is disabled' },
        { status: 403 }
      )
    }

    // Check if new password is the same as old password
    const isSamePassword = await verifyPassword(password, resetToken.user.password)
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'New password must be different from the current password' },
        { status: 400 }
      )
    }

    // Hash new password
    const hashedPassword = await hashPassword(password)

    // Update user password and mark token as used
    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          password: hashedPassword,
          mustChangePassword: false,
        },
      })

      // Mark token as used
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      })

      // Delete all other unused tokens for this user
      await tx.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          used: false,
          id: { not: resetToken.id },
        },
      })
    })

    return NextResponse.json({
      message: 'Password has been reset successfully. You can now log in with your new password.',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

