import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership, handleApiError } from '@/lib/middleware'
import { currencySchema } from '@/lib/validations/common'
import { parseStrictDateOnly, parseStrictNumber, todayDateOnly } from '@/lib/utils'
import { chainFarmIds, greenBeanLotsOnFarms } from '@/lib/farmAccess'

const createPricingHistorySchema = z.object({
  greenBeanLotId: z.string({ message: 'Green bean lot ID is required' })
    .min(1, 'Green bean lot ID is required'),
  // A number or a plain numeric string ("160"); coercion would also take
  // true as 1 and "0x10" as 16. Must be a real price above 0.
  pricePerKg: z.preprocess(
    (v) => parseStrictNumber(v) ?? v,
    z.number({ message: 'pricePerKg must be a number greater than 0' })
      .positive('pricePerKg must be a number greater than 0'),
  ),
  currency: currencySchema,
  // A real calendar day: 2026-02-30 is refused instead of becoming March 2.
  effectiveDate: z.string()
    .refine((v) => {
      const d = parseStrictDateOnly(v)
      return d !== null && !Number.isNaN(d.getTime())
    }, { message: 'Invalid effectiveDate value' })
    .optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

// GET /api/pricing-history - List all pricing history
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Prisma.PricingHistoryWhereInput = {}
    
    // Filter by greenBeanLotId if provided
    const greenBeanLotId = request.nextUrl.searchParams.get('greenBeanLotId')
    if (greenBeanLotId) {
      where.greenBeanLotId = greenBeanLotId
    }

    // A farmer-only user sees the prices of the green beans they may open:
    // those hulled from their own and shared farms' parchment, as on
    // GET /api/green-bean-lots. Staff roles and Admins see every lot's
    // (lib/farmAccess).
    const farmIds = await chainFarmIds(user)
    if (farmIds) {
      where.greenBeanLot = greenBeanLotsOnFarms(farmIds)
    }

    const pricingHistory = await prisma.pricingHistory.findMany({
      where,
      include: {
        greenBeanLot: {
          select: {
            id: true,
            grade: true,
          },
        },
        setter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { effectiveDate: 'desc' },
    })

    return NextResponse.json({ pricingHistory })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/pricing-history - Create new pricing history entry
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    // SECURITY: a price entry also rewrites the lot's current price, so it
    // takes the same rights as editing the lot: Processor/Admin, and only
    // the Processor who created the lot (Admin bypasses ownership).
    requireRole(user, ['Processor', 'Admin'])

    const body = await request.json()
    const parsed = createPricingHistorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid pricing history input' },
        { status: 400 }
      )
    }
    const { greenBeanLotId, pricePerKg, currency, effectiveDate, notes } = parsed.data

    const lot = await prisma.greenBeanLot.findUnique({
      where: { id: greenBeanLotId },
      select: { id: true, createdById: true },
    })
    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }
    requireOwnership(user, lot.createdById, ['Admin'])

    // No date sent: today on Thai time, anchored like a picked date.
    const effective = parseStrictDateOnly(effectiveDate) ?? todayDateOnly()

    // The audit row and the lot's current price move together or not at all.
    const pricingHistory = await prisma.$transaction(async (tx) => {
      const entry = await tx.pricingHistory.create({
        data: {
          greenBeanLotId,
          pricePerKg,
          currency,
          effectiveDate: effective,
          setBy: user.id,
          notes: notes || null,
        },
        include: {
          greenBeanLot: {
            select: {
              id: true,
              grade: true,
            },
          },
          setter: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      await tx.greenBeanLot.update({
        where: { id: greenBeanLotId },
        data: {
          pricePerKg,
          currency,
          priceSetDate: effective,
          priceSetBy: user.id,
        },
      })

      return entry
    })

    return NextResponse.json(
      { pricingHistory, message: 'Pricing history created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
