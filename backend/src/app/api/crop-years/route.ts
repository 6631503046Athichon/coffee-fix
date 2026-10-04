import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { parseDateOnly } from '@/lib/utils'
import { upkeepCropYears } from '@/lib/cropYears'
import { isAdminUser } from '@/lib/saleOrders'

// GET /api/crop-years - List all crop years (auto-creates if needed)
// Login required: the call may write crop years.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Lot and batch counts span every farmer and processor ("each their
    // own"), so only Admins get them.
    const listCropYears = () =>
      prisma.cropYear.findMany({
        orderBy: { startDate: 'desc' },
        ...(isAdminUser(user)
          ? {
              include: {
                _count: {
                  select: {
                    harvestLots: true,
                    processingBatches: true,
                  },
                },
              },
            }
          : {}),
      })

    // Add a missing previous / current / next year and replace the old
    // auto labels, then list again only if anything was written.
    let cropYears = await listCropYears()
    if (await upkeepCropYears(cropYears)) {
      cropYears = await listCropYears()
    }

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
        startDate: parseDateOnly(startDate) ?? new Date(),
        endDate: parseDateOnly(endDate) ?? new Date(),
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

