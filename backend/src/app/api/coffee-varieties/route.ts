import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/coffee-varieties - List all coffee varieties
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}

    // Filter by isActive if provided
    const isActive = request.nextUrl.searchParams.get('isActive')
    if (isActive !== null) {
      where.isActive = isActive === 'true'
    }

    // Filter by species if provided
    const species = request.nextUrl.searchParams.get('species')
    if (species) {
      where.species = species
    }

    // Search by name
    const search = request.nextUrl.searchParams.get('search')
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive'
      }
    }

    const coffeeVarieties = await prisma.coffeeVariety.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ coffeeVarieties })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/coffee-varieties - Create new coffee variety (Admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const body = await request.json()
    const { name, species, origin, description, characteristics, altitude, isActive } = body

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!species) {
      return NextResponse.json(
        { error: 'Species is required' },
        { status: 400 }
      )
    }

    // Check if variety already exists
    const existing = await prisma.coffeeVariety.findUnique({
      where: { name }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Coffee variety with this name already exists' },
        { status: 400 }
      )
    }

    const coffeeVariety = await prisma.coffeeVariety.create({
      data: {
        name,
        species,
        origin: origin || null,
        description: description || null,
        characteristics: characteristics || null,
        altitude: altitude || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json(
      { coffeeVariety, message: 'Coffee variety created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
