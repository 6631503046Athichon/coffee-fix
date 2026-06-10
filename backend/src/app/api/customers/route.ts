import { NextRequest, NextResponse } from 'next/server'
import { Prisma, CustomerType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, validateQuery, createCustomerSchema, customerQuerySchema } from '@/lib/validations'

// GET /api/customers - List all customers
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    // Customer rows are PII (contact emails, phone numbers, addresses).
    // Farmers / Cuppers have no business reason to read the full list, so
    // restrict it to roles that actually fulfil sales orders.
    requireRole(user, ['Admin', 'Roaster'])

    const queryValidation = validateQuery(request, customerQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.error
    }

    const { type, search } = queryValidation.data
    const where: Prisma.CustomerWhereInput = {}

    if (type && (Object.values(CustomerType) as string[]).includes(type)) {
      where.type = type as CustomerType
    }

    const normalizedSearch = search?.trim()
    if (normalizedSearch) {
      const matchedTypes = (Object.values(CustomerType) as string[]).filter((customerType) =>
        customerType.toLowerCase().includes(normalizedSearch.toLowerCase())
      )

      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { contactEmail: { contains: normalizedSearch, mode: 'insensitive' } },
        { contactPhone: { contains: normalizedSearch, mode: 'insensitive' } },
        { address: { contains: normalizedSearch, mode: 'insensitive' } },
        ...matchedTypes.map((matchedType) => ({ type: matchedType as CustomerType })),
      ]
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

    const validation = await validateBody(request, createCustomerSchema)
    if (!validation.success) {
      return validation.error
    }

    const { name, type, contactEmail, contactPhone, address, notes } = validation.data

    const customer = await prisma.customer.create({
      data: {
        name,
        type,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
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

