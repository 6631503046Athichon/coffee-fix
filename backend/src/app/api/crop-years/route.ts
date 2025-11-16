import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/crop-years - List all crop years
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const cropYears = await prisma.cropYear.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: {
            harvestLots: true,
            processingBatches: true,
          },
        },
      },
    })

    return NextResponse.json({ cropYears })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/crop-years - Create new crop year
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const body = await request.json()
    const { year, startDate, endDate, description } = body

    // Validation
    if (!year || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Year, start date, and end date are required' },
        { status: 400 }
      )
    }

    // Check if year already exists
    const existing = await prisma.cropYear.findUnique({
      where: { year },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Crop year already exists' },
        { status: 409 }
      )
    }

    const cropYear = await prisma.cropYear.create({
      data: {
        year,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        description: description || null,
      },
    })

    return NextResponse.json(
      { cropYear, message: 'Crop year created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

