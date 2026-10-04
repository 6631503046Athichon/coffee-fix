import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, updateCustomerSchema } from '@/lib/validations'
import { isAdminUser, isPrismaCode } from '@/lib/saleOrders'

const CUSTOMER_HAS_SALES_MESSAGE =
  'This customer has sales recorded (by you or another roaster), so it cannot be deleted.'

// GET /api/customers/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Customer records contain PII (email, phone, address).
    // Restrict to Admin and Roaster (the roles that transact with customers).
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    // The customer is shared; the sales on it are the viewer's own (Admins see all).
    const ownSales: Prisma.SaleOrderWhereInput = isAdminUser(user) ? {} : { createdBy: user.id }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        saleOrders: {
          where: ownSales,
          take: 10,
          orderBy: { orderDate: 'desc' },
          include: {
            items: true,
          },
        },
        _count: {
          select: {
            saleOrders: { where: ownSales },
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
// Processors pick customers in the Withdraw Stock popup and may add one there,
// so they may also correct one (D3). Deleting stays with Admin and Roaster.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster', 'Processor'])
    const { id } = await params

    const validation = await validateBody(request, updateCustomerSchema)
    if (!validation.success) {
      return validation.error
    }

    const { name, type, contactEmail, contactPhone, address, notes } = validation.data
    const updateData: Prisma.CustomerUpdateInput = {}
    if (name !== undefined) updateData.name = name
    if (type !== undefined) updateData.type = type
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone?.trim() || null
    if (address !== undefined) updateData.address = address?.trim() || null
    if (notes !== undefined) updateData.notes = notes?.trim() || null

    const existingCustomer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existingCustomer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

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
// The address book is shared, so a customer anyone has sold to stays.
// Processors may add and edit customers but not delete them.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    // Counts every roaster's sales, not only the caller's.
    const ordersCount = await prisma.saleOrder.count({
      where: { customerId: id },
    })

    if (ordersCount > 0) {
      return NextResponse.json({ error: CUSTOMER_HAS_SALES_MESSAGE }, { status: 409 })
    }

    try {
      await prisma.customer.delete({
        where: { id },
      })
    } catch (error) {
      // A sale was recorded for this customer after the count above.
      if (isPrismaCode(error, 'P2003')) {
        return NextResponse.json({ error: CUSTOMER_HAS_SALES_MESSAGE }, { status: 409 })
      }
      if (isPrismaCode(error, 'P2025')) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ message: 'Customer deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
