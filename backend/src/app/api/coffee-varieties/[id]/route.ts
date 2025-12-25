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

    // If name is being changed, check for duplicates
    if (name && name !== existing.name) {
      const duplicate = await prisma.coffeeVariety.findUnique({
        where: { name }
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
        ...(name !== undefined && { name }),
        ...(species !== undefined && { species }),
        ...(origin !== undefined && { origin }),
        ...(description !== undefined && { description }),
        ...(characteristics !== undefined && { characteristics }),
        ...(altitude !== undefined && { altitude }),
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
