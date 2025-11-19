import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { handleApiError } from '@/lib/middleware'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
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

    console.log('[FORGOT-PASSWORD] User lookup:', { email, found: !!user, hasEmail: !!user?.email })

    // Don't reveal if user exists or not (security best practice)
    // Always return success message
    if (!user || !user.email) {
      console.log('[FORGOT-PASSWORD] Skipping email send - user not found or no email')
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

    // Send password reset email
    // If email fails, return error (no mock mode)
    console.log('[FORGOT-PASSWORD] Attempting to send email to:', user.email)
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.name)
      console.log('[FORGOT-PASSWORD] Email sent successfully')
    } catch (emailError) {
      // Email failed - return error to user
      console.error('[FORGOT-PASSWORD] Failed to send email:', emailError)
      return NextResponse.json(
        {
          error: emailError instanceof Error
            ? emailError.message
            : 'Failed to send password reset email. Please check email configuration.'
        },
        { status: 500 }
      )
    }

    // In development mode, include token in response for testing
    const isDevelopment = process.env.NODE_ENV !== 'production'
    const response: any = {
      message: 'If an account with that email exists, we have sent a password reset link.',
    }

    if (isDevelopment) {
      response.devToken = resetToken
      // Use hash router format: /#/reset-password?token=...
      response.devResetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/reset-password?token=${resetToken}`
      console.log('[DEV] Password reset token for testing:', resetToken)
      console.log('[DEV] Reset URL:', response.devResetUrl)
    }

    return NextResponse.json(response)
  } catch (error) {
    return handleApiError(error)
  }
}
