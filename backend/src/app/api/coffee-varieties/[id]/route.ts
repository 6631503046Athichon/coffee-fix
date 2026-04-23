import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/coffee-varieties/[id] - Get single coffee variety
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const coffeeVariety = await prisma.coffeeVariety.findUnique({
      where: { id }
    })

    if (!coffeeVariety) {
      return NextResponse.json(
        { error: 'Coffee variety not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ coffeeVariety })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/coffee-varieties/[id] - Update coffee variety (Admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const body = await request.json()
    const { name, species, origin, description, characteristics, altitude, isActive } = body
    const normalizedName = typeof name === 'string' ? name.trim() : undefined
    const normalizedSpecies = typeof species === 'string' ? species.trim() : undefined

    // Check if variety exists
    const existing = await prisma.coffeeVariety.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Coffee variety not found' },
        { status: 404 }
      )
    }

    if (normalizedName !== undefined && !normalizedName) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (normalizedSpecies !== undefined && !normalizedSpecies) {
      return NextResponse.json(
        { error: 'Species is required' },
        { status: 400 }
      )
    }

    // If name is being changed, check for duplicates
    if (normalizedName && normalizedName !== existing.name) {
      const duplicate = await prisma.coffeeVariety.findUnique({
        where: { name: normalizedName }
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Coffee variety with this name already exists' },
          { status: 400 }
        )
      }
    }

    const coffeeVariety = await prisma.coffeeVariety.update({
      where: { id },
      data: {
        ...(normalizedName !== undefined && { name: normalizedName }),
        ...(normalizedSpecies !== undefined && { species: normalizedSpecies }),
        ...(origin !== undefined && { origin: typeof origin === 'string' ? origin.trim() || null : null }),
        ...(description !== undefined && { description: typeof description === 'string' ? description.trim() || null : null }),
        ...(characteristics !== undefined && { characteristics: typeof characteristics === 'string' ? characteristics.trim() || null : null }),
        ...(altitude !== undefined && { altitude: typeof altitude === 'string' ? altitude.trim() || null : null }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({
      coffeeVariety,
      message: 'Coffee variety updated successfully'
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/coffee-varieties/[id] - Delete coffee variety (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    // Check if variety exists
    const existing = await prisma.coffeeVariety.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Coffee variety not found' },
        { status: 404 }
      )
    }

    await prisma.coffeeVariety.delete({
      where: { id }
    })

    return NextResponse.json({
      message: 'Coffee variety deleted successfully'
    })
  } catch (error) {
    return handleApiError(error)
  }
}
