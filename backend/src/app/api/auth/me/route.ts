import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        roles: user.roles,
        isActive: user.isActive,
        isSuperAdmin: user.isSuperAdmin,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

