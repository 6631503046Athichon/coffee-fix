import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// Helper function to ensure 3 crop years exist: previous, current, next
async function ensureCropYears() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  // Determine the active crop year based on current date
  // Crop year runs from October 1 to September 30
  let activeCropYearStart: number
  if (currentMonth >= 10) {
    activeCropYearStart = currentYear
  } else {
    activeCropYearStart = currentYear - 1
  }

  // Create 3 crop years: previous, current, next
  const offsets = [-1, 0, 1]
  const cropYears = []

  for (const offset of offsets) {
    const yearStart = activeCropYearStart + offset
    const yearEnd = yearStart + 1
    const yearString = `${yearStart}/${yearEnd}`
    const label = offset === -1 ? 'Previous' : offset === 0 ? 'Current' : 'Next'

    const cropYear = await prisma.cropYear.upsert({
      where: { year: yearString },
      update: {
        startDate: new Date(`${yearStart}-10-01`),
        endDate: new Date(`${yearEnd}-09-30`),
        description: `${label} crop year ${yearString}`,
      },
      create: {
        year: yearString,
        startDate: new Date(`${yearStart}-10-01`),
        endDate: new Date(`${yearEnd}-09-30`),
        description: `${label} crop year ${yearString}`,
      },
    })
    cropYears.push(cropYear)
  }

  return cropYears
}

// GET /api/crop-years - List all crop years (auto-creates if needed)
// No auth required - crop years are public data
export async function GET(request: NextRequest) {
  try {
    // Ensure crop years exist before fetching (auto-creates if needed)
    await ensureCropYears()

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

