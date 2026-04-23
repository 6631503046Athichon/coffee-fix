import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// This route depends on auth cookies/headers, so it must be dynamic.
export const dynamic = 'force-dynamic'

// GET /api/coffee-varieties - List all coffee varieties
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: Prisma.CoffeeVarietyWhereInput = {}

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
    const normalizedName = typeof name === 'string' ? name.trim() : ''
    const normalizedSpecies = typeof species === 'string' ? species.trim() : ''

    // Validation
    if (!normalizedName) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!normalizedSpecies) {
      return NextResponse.json(
        { error: 'Species is required' },
        { status: 400 }
      )
    }

    // Check if variety already exists
    const existing = await prisma.coffeeVariety.findUnique({
      where: { name: normalizedName }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Coffee variety with this name already exists' },
        { status: 400 }
      )
    }

    const coffeeVariety = await prisma.coffeeVariety.create({
      data: {
        name: normalizedName,
        species: normalizedSpecies,
        origin: typeof origin === 'string' ? origin.trim() || null : null,
        description: typeof description === 'string' ? description.trim() || null : null,
        characteristics: typeof characteristics === 'string' ? characteristics.trim() || null : null,
        altitude: typeof altitude === 'string' ? altitude.trim() || null : null,
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
