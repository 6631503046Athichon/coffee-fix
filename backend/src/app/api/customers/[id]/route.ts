import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/customers/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        saleOrders: {
          take: 10,
          orderBy: { orderDate: 'desc' },
          include: {
            items: true,
          },
        },
        _count: {
          select: {
            saleOrders: true,
          },
        },
      },
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ customer })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/customers/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const body = await request.json()
    const { name, type, contactEmail, contactPhone, address, notes } = body

    const updateData: Prisma.CustomerUpdateInput = {}
    if (name !== undefined) updateData.name = name
    if (type !== undefined) updateData.type = type
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone
    if (address !== undefined) updateData.address = address
    if (notes !== undefined) updateData.notes = notes

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ customer: updatedCustomer })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/customers/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    // Check if customer has orders
    const ordersCount = await prisma.saleOrder.count({
      where: { customerId: id },
    })

    if (ordersCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete customer with existing orders' },
        { status: 400 }
      )
    }

    await prisma.customer.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Customer deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
