import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/coffee-grades/[id] - Get single coffee grade
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const coffeeGrade = await prisma.coffeeGrade.findUnique({
      where: { id },
    })

    if (!coffeeGrade) {
      return NextResponse.json(
        { error: 'Coffee grade not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ coffeeGrade })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/coffee-grades/[id] - Update coffee grade (Admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const body = await request.json()
    const { name, description, sortOrder, isActive } = body
    const normalizedName = typeof name === 'string' ? name.trim() : undefined

    // Check if grade exists
    const existing = await prisma.coffeeGrade.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Coffee grade not found' },
        { status: 404 }
      )
    }

    if (normalizedName !== undefined && !normalizedName) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (normalizedName !== undefined && normalizedName.length > 50) {
      return NextResponse.json(
        { error: 'Name must be 50 characters or fewer' },
        { status: 400 }
      )
    }

    // If name is being changed, check for duplicates
    const isRename = normalizedName !== undefined && normalizedName !== existing.name
    if (isRename) {
      const duplicate = await prisma.coffeeGrade.findUnique({
        where: { name: normalizedName },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Coffee grade with this name already exists' },
          { status: 400 }
        )
      }
    }

    const parsedSortOrder = Number(sortOrder)

    const data = {
      ...(normalizedName !== undefined && { name: normalizedName }),
      ...(description !== undefined && {
        description: typeof description === 'string' ? description.trim() || null : null,
      }),
      ...(sortOrder !== undefined && Number.isFinite(parsedSortOrder) && {
        sortOrder: Math.trunc(parsedSortOrder),
      }),
      ...(isActive !== undefined && { isActive }),
    }

    // GreenBeanLot stores the grade as a plain string, so a rename has to
    // carry over to the lots already filed under the old name - otherwise
    // they would point at a grade that no longer exists and drop out of
    // the grade filter. Sale order and invoice items keep their own
    // lotGrade untouched: those are snapshots of what was agreed at the
    // time the document was issued.
    let coffeeGrade
    let relabelledLots = 0

    if (isRename) {
      const [updated, relabelled] = await prisma.$transaction([
        prisma.coffeeGrade.update({ where: { id }, data }),
        prisma.greenBeanLot.updateMany({
          where: { grade: existing.name },
          data: { grade: normalizedName as string },
        }),
      ])
      coffeeGrade = updated
      relabelledLots = relabelled.count
    } else {
      coffeeGrade = await prisma.coffeeGrade.update({ where: { id }, data })
    }

    return NextResponse.json({
      coffeeGrade,
      relabelledLots,
      message: 'Coffee grade updated successfully',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/coffee-grades/[id] - Delete coffee grade (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    // Check if grade exists
    const existing = await prisma.coffeeGrade.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Coffee grade not found' },
        { status: 404 }
      )
    }

    // Deleting a grade that lots are filed under would orphan them, so
    // refuse and point the admin at deactivating instead - that hides it
    // from the dropdowns without touching the existing lots.
    const lotsUsingGrade = await prisma.greenBeanLot.count({
      where: { grade: existing.name },
    })

    if (lotsUsingGrade > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete "${existing.name}" - ${lotsUsingGrade} green bean lot(s) still use it. Set it to inactive instead to hide it from new entries.`,
        },
        { status: 409 }
      )
    }

    await prisma.coffeeGrade.delete({
      where: { id },
    })

    return NextResponse.json({
      message: 'Coffee grade deleted successfully',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
