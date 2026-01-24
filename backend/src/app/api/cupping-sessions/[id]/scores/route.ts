import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// POST /api/cupping-sessions/:id/scores - Submit score for a sample
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { sampleId, scores, notes } = body

    if (!sampleId || !scores || typeof scores !== 'object') {
      return NextResponse.json(
        { error: 'Sample ID and scores object are required' },
        { status: 400 }
      )
    }

    // Verify sample exists in this session
    const sample = await prisma.cuppingSample.findUnique({
      where: { id: sampleId },
    })

    if (!sample || sample.cuppingSessionId !== id) {
      return NextResponse.json(
        { error: 'Sample not found in this session' },
        { status: 404 }
      )
    }

    // Verify judge is part of this session
    const judge = await prisma.cuppingSessionJudge.findUnique({
      where: {
        cuppingSessionId_judgeId: {
          cuppingSessionId: id,
          judgeId: user.id,
        },
      },
    })

    if (!judge) {
      return NextResponse.json(
        { error: 'You are not a judge for this session' },
        { status: 403 }
      )
    }

    // Calculate total score
    const scoreValues = Object.values(scores).filter(v => typeof v === 'number') as number[]
    const totalScore = scoreValues.reduce((sum, score) => sum + score, 0)

    // Check if score already exists
    const existingScore = await prisma.judgeScore.findUnique({
      where: {
        cuppingSessionId_sampleId_judgeId: {
          cuppingSessionId: id,
          sampleId,
          judgeId: user.id,
        },
      },
    })

    let judgeScore
    if (existingScore) {
      // Update existing score
      judgeScore = await prisma.judgeScore.update({
        where: { id: existingScore.id },
        data: {
          scores: JSON.stringify(scores),
          notes: notes || '',
          totalScore,
        },
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
    } else {
      // Create new score
      judgeScore = await prisma.judgeScore.create({
        data: {
          cuppingSessionId: id,
          sampleId,
          judgeId: user.id,
          judgeName: user.name,
          scores: JSON.stringify(scores),
          notes: notes || '',
          totalScore,
        },
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
    }

    // If green bean lot exists, create/update cupping score
    if (sample.greenBeanLotId) {
      await prisma.cuppingScore.upsert({
        where: {
          greenBeanLotId_sessionId: {
            greenBeanLotId: sample.greenBeanLotId,
            sessionId: id,
          },
        },
        update: {
          score: totalScore,
        },
        create: {
          greenBeanLotId: sample.greenBeanLotId,
          sessionId: id,
          score: totalScore,
        },
      })
    }

    return NextResponse.json(
      { judgeScore, message: 'Score submitted successfully' },
      { status: existingScore ? 200 : 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
