import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/cupping-sessions - List all cupping sessions
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}
    
    // Filter by type if provided
    const type = request.nextUrl.searchParams.get('type')
    if (type) {
      where.type = type
    }

    // Filter by status if provided
    const status = request.nextUrl.searchParams.get('status')
    if (status) {
      where.status = status
    }

    const cuppingSessions = await prisma.cuppingSession.findMany({
      where,
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
        _count: {
          select: {
            samples: true,
            judges: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ cuppingSessions })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/cupping-sessions - Create new cupping session
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const body = await request.json()
    const { name, date, type, status, samples, judges } = body

    // Validation
    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    const cuppingSession = await prisma.$transaction(async (tx) => {
      // Create session
      const session = await tx.cuppingSession.create({
        data: {
          name,
          date: date ? new Date(date) : new Date(),
          type,
          status: status || 'Setup',
          createdBy: user.id,
        },
      })

      // Create samples if provided
      if (samples && Array.isArray(samples)) {
        for (const sample of samples) {
          const { blindCode, greenBeanLotId, submitterInfo, originInfo, lotInfo } = sample
          await tx.cuppingSample.create({
            data: {
              cuppingSessionId: session.id,
              blindCode,
              greenBeanLotId: greenBeanLotId || null,
              submitterInfo: JSON.stringify(submitterInfo),
              originInfo: JSON.stringify(originInfo),
              lotInfo: JSON.stringify(lotInfo),
            },
          })
        }
      }

      // Create judges if provided
      if (judges && Array.isArray(judges)) {
        for (const judge of judges) {
          const { judgeId, judgeName, judgeRole } = judge
          await tx.cuppingSessionJudge.create({
            data: {
              cuppingSessionId: session.id,
              judgeId,
              judgeName,
              judgeRole,
            },
          })
        }
      }

      return session
    })

    const fullSession = await prisma.cuppingSession.findUnique({
      where: { id: cuppingSession.id },
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

    return NextResponse.json(
      { cuppingSession: fullSession, message: 'Cupping session created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

