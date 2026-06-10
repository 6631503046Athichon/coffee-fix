import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 password-reset requests per hour per IP (prevents email-quota abuse)
    const limited = await rateLimit(request, RATE_LIMITS.FORGOT_PASSWORD)
    if (limited) return limited

    const body = await request.json()
    const { email } = body

    // Validation
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Find user by email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { username: email },
        ],
      },
    })

    // Don't reveal if user exists or not (security best practice)
    // Always return success message
    if (!user || !user.email) {
      return NextResponse.json({
        message: 'If an account with that email exists, we have sent a password reset link.',
      })
    }

    if (!user.isActive) {
      return NextResponse.json({
        message: 'If an account with that email exists, we have sent a password reset link.',
      })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10) // Token expires in 10 minutes

    // Delete any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        used: false,
      },
    })

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt,
      },
    })

    // Send password reset email. If sending fails we log it server-side and
    // STILL return the same generic 200 message — exposing a 500 here turns
    // the endpoint into a user-enumeration oracle (existing addresses error
    // out when SMTP misfires, non-existing ones quietly succeed). Whoever's
    // on call can see the failure in the logs.
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.name)
    } catch (emailError) {
      console.error('[FORGOT-PASSWORD] Failed to send email:', emailError)
    }

    return NextResponse.json({
      message: 'If an account with that email exists, we have sent a password reset link.',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
