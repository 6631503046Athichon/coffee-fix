import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // The setup page reads the flags from here, so an account that still
    // owes its setup is let through.
    const authUser = await requireAuth(request, { allowSetupPending: true })

    // Read the row itself rather than requireAuth's cached copy: the client
    // decides from the mustChange* flags whether to hold the user on the
    // first-login setup page, so they must change the moment setup is saved.
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        roles: true,
        isActive: true,
        isSuperAdmin: true,
        mustChangePassword: true,
        mustChangeUsername: true,
        mustChangeEmail: true,
      },
    })

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive')
    }

    return NextResponse.json({ user })
  } catch (error) {
    return handleApiError(error)
  }
}
