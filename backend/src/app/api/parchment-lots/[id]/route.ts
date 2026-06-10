import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { safeParseFloat } from '@/lib/utils'

// PATCH /api/parchment-lots/:id - Update parchment lot
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can update parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // SECURITY: Ownership check — only the Processor who created the parent
    // ProcessingBatch (or Admin) can mutate this parchment lot. Excel-imported
    // lots that have no processingBatch fall back to Admin-only.
    const existing = await prisma.parchmentLot.findUnique({
      where: { id },
      select: { processingBatch: { select: { createdById: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Parchment lot not found' }, { status: 404 })
    }
    requireOwnership(user, existing.processingBatch?.createdById, ['Admin'])

    const body = await request.json()
    const { status, currentWeightKg } = body

    const updateData: Prisma.ParchmentLotUpdateInput = {}
    if (status !== undefined) updateData.status = status
    if (currentWeightKg !== undefined) {
      const weight = safeParseFloat(currentWeightKg)
      if (weight !== null) updateData.currentWeightKg = weight
    }

    const parchmentLot = await prisma.parchmentLot.update({
      where: { id },
      data: updateData,
      include: {
        processingBatch: {
          include: {
            harvestLot: true,
          },
        },
      },
    })

    return NextResponse.json({ parchmentLot, message: 'Parchment lot updated successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

// GET /api/parchment-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const parchmentLot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        processingBatch: {
          include: {
            harvestLot: {
              include: {
                farm: {
                  select: {
                    id: true,
                    farmName: true,
                    location: true,
                  },
                },
              },
            },
          },
        },
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
          },
        },
        physicalTestResults: true,
        greenBeanLots: true,
      },
    })

    if (!parchmentLot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ parchmentLot })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/parchment-lots/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor and Admin can delete parchment lots
    requireRole(user, ['Processor', 'Admin'])
    const { id } = await params

    // Check if lot exists
    const lot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        greenBeanLots: true,
        processingBatch: { select: { createdById: true } },
      },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Ownership check — only the Processor who created the parent
    // ProcessingBatch (or Admin) can delete this parchment lot.
    requireOwnership(user, lot.processingBatch?.createdById, ['Admin'])

    // Check if there are green bean lots linked
    if (lot.greenBeanLots && lot.greenBeanLots.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete parchment lot with linked green bean lots. Delete green bean lots first.' },
        { status: 400 }
      )
    }

    // PhysicalTestResults and ParchmentWithdrawal both cascade on delete in
    // the schema, so a single delete inside a transaction is sufficient and
    // atomic — no separate deleteMany() is needed.
    await prisma.$transaction(async (tx) => {
      await tx.parchmentLot.delete({
        where: { id },
      })
    })

    return NextResponse.json({ message: 'Parchment lot deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
