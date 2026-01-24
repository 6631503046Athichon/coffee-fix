import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// POST /api/cupping-sessions/:id/judges - Add judge to session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { judgeId, judgeName, judgeRole } = body

    if (!judgeId || !judgeName || !judgeRole) {
      return NextResponse.json(
        { error: 'Judge ID, name, and role are required' },
        { status: 400 }
      )
    }

    const judge = await prisma.cuppingSessionJudge.create({
      data: {
        cuppingSessionId: id,
        judgeId,
        judgeName,
        judgeRole,
      },
      include: {
        judge: {
          select: {
            id: true,
            name: true,
            roles: true,
          },
        },
      },
    })

    return NextResponse.json(
      { judge, message: 'Judge added successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
