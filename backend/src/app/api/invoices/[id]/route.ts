import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// GET /api/invoices/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
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
    await requireAuth(request)
    const { id } = await params

    const body = await request.json()
    const { status, notes } = body

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

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
