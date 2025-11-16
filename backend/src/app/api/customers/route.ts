import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/customers - List all customers
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: any = {}
    
    // Filter by type if provided
    const type = request.nextUrl.searchParams.get('type')
    if (type) {
      where.type = type
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: {
            saleOrders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ customers })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/customers - Create new customer
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin', 'Roaster'])

    const body = await request.json()
    const { name, type, contactEmail, contactPhone, address, notes } = body

    // Validation
    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        type,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        address: address || null,
        notes: notes || null,
      },
    })

    return NextResponse.json(
      { customer, message: 'Customer created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

