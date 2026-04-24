import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { updateSaleOrderSchema, validateBody } from '@/lib/validations'

const updateSaleOrderRequestSchema = updateSaleOrderSchema.pick({
  status: true,
  notes: true,
})

// GET /api/sale-orders/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Sale orders expose pricing + customer PII.
    // Restrict to Admin and Roaster (the roles that manage sales).
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const saleOrder = await prisma.saleOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            greenBeanLot: {
              include: {
                parchmentLot: {
                  include: {
                    harvestLot: {
                      select: {
                        id: true,
                        farmerName: true,
                        cherryVariety: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        invoices: {
          orderBy: { issueDate: 'desc' },
        },
      },
    })

    if (!saleOrder) {
      return NextResponse.json(
        { error: 'Sale order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ saleOrder })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/sale-orders/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const validation = await validateBody(request, updateSaleOrderRequestSchema)
    if (!validation.success) {
      return validation.error
    }

    const { status, notes } = validation.data

    const updateData: Prisma.SaleOrderUpdateInput = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes?.trim() || null

    const existingOrder = await prisma.saleOrder.findUnique({
      where: { id },
      select: { id: true, createdBy: true },
    })

    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Sale order not found' },
        { status: 404 }
      )
    }

    // SECURITY: Ownership — one Roaster cannot edit another Roaster's order.
    requireOwnership(user, existingOrder.createdBy, ['Admin'])

    const updatedOrder = await prisma.saleOrder.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        items: {
          include: {
            greenBeanLot: {
              select: {
                id: true,
                grade: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ saleOrder: updatedOrder })
  } catch (error) {
    return handleApiError(error)
  }
}
