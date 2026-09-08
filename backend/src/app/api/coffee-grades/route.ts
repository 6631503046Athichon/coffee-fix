import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// This route depends on auth cookies/headers, so it must be dynamic.
export const dynamic = 'force-dynamic'

// Grades are listed by sortOrder so the dropdowns keep the order a
// processor expects (Grade A/B/C, Peaberry, then screen sizes largest
// first) rather than the order alphabetical sorting would produce.
const GRADE_ORDER_BY: Prisma.CoffeeGradeOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
]

// GET /api/coffee-grades - List all coffee grades
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: Prisma.CoffeeGradeWhereInput = {}

    // Filter by isActive if provided
    const isActive = request.nextUrl.searchParams.get('isActive')
    if (isActive !== null) {
      where.isActive = isActive === 'true'
    }

    // Search by name
    const search = request.nextUrl.searchParams.get('search')
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      }
    }

    const coffeeGrades = await prisma.coffeeGrade.findMany({
      where,
      orderBy: GRADE_ORDER_BY,
    })

    return NextResponse.json({ coffeeGrades })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/coffee-grades - Create new coffee grade (Admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const body = await request.json()
    const { name, description, sortOrder, isActive } = body
    const normalizedName = typeof name === 'string' ? name.trim() : ''

    // Validation
    if (!normalizedName) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (normalizedName.length > 50) {
      return NextResponse.json(
        { error: 'Name must be 50 characters or fewer' },
        { status: 400 }
      )
    }

    // Check if grade already exists
    const existing = await prisma.coffeeGrade.findUnique({
      where: { name: normalizedName },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Coffee grade with this name already exists' },
        { status: 400 }
      )
    }

    // Default new grades to the end of the list rather than the front.
    let resolvedSortOrder = Number(sortOrder)
    if (!Number.isFinite(resolvedSortOrder)) {
      const last = await prisma.coffeeGrade.findFirst({
        select: { sortOrder: true },
        orderBy: { sortOrder: 'desc' },
      })
      resolvedSortOrder = (last?.sortOrder ?? 0) + 10
    }

    const coffeeGrade = await prisma.coffeeGrade.create({
      data: {
        name: normalizedName,
        description: typeof description === 'string' ? description.trim() || null : null,
        sortOrder: Math.trunc(resolvedSortOrder),
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json(
      { coffeeGrade, message: 'Coffee grade created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
