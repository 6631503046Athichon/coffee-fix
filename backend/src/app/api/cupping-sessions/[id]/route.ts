import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/cupping-sessions/:id
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request)

    const cuppingSession = await prisma.cuppingSession.findUnique({
      where: { id: params.id },
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
      },
    })

    if (!cuppingSession) {
      return NextResponse.json(
        { error: 'Cupping session not found' },
        { status: 404 }
      )
    }

    // Get all scores for this session
    const scores = await prisma.judgeScore.findMany({
      where: { cuppingSessionId: params.id },
      include: {
        judge: {
          select: {
            id: true,
            name: true,
          },
        },
        sample: {
          select: {
            id: true,
            blindCode: true,
          },
        },
      },
    })

    // Organize scores by sample
    const scoresBySample: any = {}
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

    return NextResponse.json({
      cuppingSession: {
        ...cuppingSession,
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
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request)

    const body = await request.json()
    const { name, date, type, status, finalResults } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (date !== undefined) updateData.date = new Date(date)
    if (type !== undefined) updateData.type = type
    if (status !== undefined) updateData.status = status
    if (finalResults !== undefined) updateData.finalResults = JSON.stringify(finalResults)

    const updatedSession = await prisma.cuppingSession.update({
      where: { id: params.id },
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

