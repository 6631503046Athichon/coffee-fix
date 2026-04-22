import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 20 token verifications per 15 minutes per IP (prevents enumeration)
    const limited = await rateLimit(request, RATE_LIMITS.VERIFY_TOKEN)
    if (limited) return limited

    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Find reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
          },
        },
      },
    })

    if (!resetToken) {
      return NextResponse.json({ valid: false })
    }

    // Check if token is used
    if (resetToken.used) {
      return NextResponse.json({ valid: false })
    }

    // Check if token is expired
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json({ valid: false })
    }

    // Check if user is active
    if (!resetToken.user.isActive) {
      return NextResponse.json({ valid: false })
    }

    return NextResponse.json({
      valid: true,
      email: resetToken.user.email,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

