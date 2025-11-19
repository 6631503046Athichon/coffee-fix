import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// Helper function to ensure crop years exist
async function ensureCropYears() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12
  
  // Determine the active crop year based on current date
  // If month >= 10 (October), we're in the new crop year
  // If month < 10, we're still in the previous crop year
  let activeCropYearStart: number
  if (currentMonth >= 10) {
    activeCropYearStart = currentYear
  } else {
    activeCropYearStart = currentYear - 1
  }
  
  // Create crop years: previous 2 years, current year, and next 2 years
  const cropYearsToCreate = []
  for (let i = -2; i <= 2; i++) {
    const yearStart = activeCropYearStart + i
    const yearEnd = yearStart + 1
    const yearString = `${yearStart}/${yearEnd}`
    
    cropYearsToCreate.push({
      year: yearString,
      startDate: new Date(`${yearStart}-10-01`),
      endDate: new Date(`${yearEnd}-09-30`),
      description: i === 0 
        ? `Current crop year ${yearString}` 
        : i < 0 
          ? `Previous crop year ${yearString}`
          : `Next crop year ${yearString}`,
    })
  }

  const createdCropYears = []
  for (const cy of cropYearsToCreate) {
    const cropYear = await prisma.cropYear.upsert({
      where: { year: cy.year },
      update: {
        // Update dates and description in case they changed
        startDate: cy.startDate,
        endDate: cy.endDate,
        description: cy.description,
      },
      create: {
        year: cy.year,
        startDate: cy.startDate,
        endDate: cy.endDate,
        description: cy.description,
      },
    })
    createdCropYears.push(cropYear)
  }
  
  return createdCropYears
}

// GET /api/crop-years - List all crop years (auto-creates if needed)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    // Ensure crop years exist before fetching
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

