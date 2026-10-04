import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { updateInvoiceSchema, validateBody } from '@/lib/validations'

const updateInvoiceRequestSchema = updateInvoiceSchema.pick({
  status: true,
  notes: true,
})

// GET /api/invoices/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Invoices expose pricing + customer PII.
    // Restrict to Admin and Roaster (the roles that manage sales).
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        saleOrder: {
          include: {
            customer: true,
          },
        },
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
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // SECURITY: Ownership — a Roaster reads only invoices on their own sales.
    requireOwnership(user, invoice.saleOrder.createdBy, ['Admin'])

    return NextResponse.json({ invoice })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/invoices/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])
    const { id } = await params

    const validation = await validateBody(request, updateInvoiceRequestSchema)
    if (!validation.success) {
      return validation.error
    }

    const { status, notes } = validation.data

    const updateData: Prisma.InvoiceUpdateInput = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes?.trim() || null

    const existingInvoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, saleOrder: { select: { createdBy: true } } },
    })

    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // SECURITY: Ownership — the sale's owner (the Roaster who recorded it) or
    // an Admin, as on GET. Not the invoice's creator: an invoice an Admin
    // issued on a Roaster's sale is still that Roaster's to update, and one
    // Roaster still cannot edit another Roaster's invoice.
    requireOwnership(user, existingInvoice.saleOrder.createdBy, ['Admin'])

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        saleOrder: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
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

    return NextResponse.json({ invoice: updatedInvoice })
  } catch (error) {
    return handleApiError(error)
  }
}
