import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/cupping-sessions/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await requireAuth(request)

    const cuppingSession = await prisma.cuppingSession.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        samples: {
          include: {
            greenBeanLot: {
              include: {
                parchmentLot: {
                  include: {
                    harvestLot: {
                      select: {
                        id: true,
                        farmerName: true,
                        cherryVariety: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        judges: {
          include: {
            judge: {
              select: {
                id: true,
                name: true,
                roles: true,
              },
            },
          },
        },
        scores: {
          select: {
            id: true,
            sampleId: true,
            judgeId: true,
            judgeName: true,
            scores: true,
            notes: true,
            totalScore: true,
          },
        },
      },
    })

    if (!cuppingSession) {
      return NextResponse.json(
        { error: 'Cupping session not found' },
        { status: 404 }
      )
    }

    const scores = cuppingSession.scores

    // Organize scores by sample
    const scoresBySample: Record<string, Record<string, unknown>[]> = {}
    for (const score of scores) {
      if (!scoresBySample[score.sampleId]) {
        scoresBySample[score.sampleId] = []
      }
      scoresBySample[score.sampleId].push({
        judgeId: score.judgeId,
        judgeName: score.judgeName,
        scores: typeof score.scores === 'string' ? JSON.parse(score.scores) : score.scores,
        notes: score.notes,
        totalScore: score.totalScore,
      })
    }

    const { scores: _rawScores, ...sessionData } = cuppingSession
    return NextResponse.json({
      cuppingSession: {
        ...sessionData,
        scores: scoresBySample,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/cupping-sessions/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)
    // SECURITY: Only Cupper and Admin can mutate sessions.
    requireRole(user, ['Cupper', 'Admin'])

    // SECURITY: Ownership — only the Cupper who created the session (or Admin)
    // can update it. Prevents one Cupper finalizing another Cupper's session.
    const existingSession = await prisma.cuppingSession.findUnique({
      where: { id },
      select: { createdBy: true },
    })
    if (!existingSession) {
      return NextResponse.json(
        { error: 'Cupping session not found' },
        { status: 404 }
      )
    }
    requireOwnership(user, existingSession.createdBy, ['Admin'])

    const body = await request.json()
    const { name, date, type, status, finalResults } = body

    const updateData: Prisma.CuppingSessionUpdateInput = {}
    if (name !== undefined) updateData.name = name
    if (date !== undefined) updateData.date = new Date(date)
    if (type !== undefined) updateData.type = type
    if (status !== undefined) updateData.status = status
    if (finalResults !== undefined) updateData.finalResults = JSON.stringify(finalResults)

    const updatedSession = await prisma.cuppingSession.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        samples: {
          include: {
            greenBeanLot: {
              select: {
                id: true,
                grade: true,
              },
            },
          },
        },
        judges: {
          include: {
            judge: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ cuppingSession: updatedSession })
  } catch (error) {
    return handleApiError(error)
  }
}
