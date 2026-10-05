import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { validateBody, createGreenBeanLotSchema } from '@/lib/validations'
import { nextDisplayId, withDisplayIdRetry } from '@/lib/utils'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { greenBeanLotForViewer } from '@/lib/withdrawalPrivacy'
import { withParchmentImporterFor } from '@/lib/importerPrivacy'
import { chainScope } from '@/lib/farmAccess'
import { isAdminUser } from '@/lib/saleOrders'

// GET /api/green-bean-lots - List all green bean lots
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: Record<string, unknown> = {}

    // Filter by sourceType if provided
    const sourceType = request.nextUrl.searchParams.get('sourceType')
    if (sourceType) {
      where.sourceType = sourceType
    }

    // Filter by availabilityStatus if provided
    const availabilityStatus = request.nextUrl.searchParams.get('availabilityStatus')
    if (availabilityStatus) {
      where.availabilityStatus = availabilityStatus
    }

    // Filter by parchmentLotId if provided
    const parchmentLotId = request.nextUrl.searchParams.get('parchmentLotId')
    if (parchmentLotId) {
      where.parchmentLotId = parchmentLotId
    }

    // Each their own (lib/farmAccess chainScope): a processor's own lots, a
    // farmer's hulled from their own and shared farms' parchment, a roaster's
    // own, held and roasted lots plus the shelf (never another user's
    // bought-in lot); the union for several roles. Admins see every lot.
    const scope = await chainScope(user)
    if (scope) {
      where.AND = [scope.greenBeanLotWhere]
    }

    // Pagination
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const [greenBeanLots, total] = await Promise.all([
      prisma.greenBeanLot.findMany({
        where,
        include: {
          parchmentLot: {
            include: {
              processingBatch: {
                select: {
                  id: true,
                  processType: true,
                },
              },
              harvestLot: {
                select: {
                  id: true,
                  farmerName: true,
                  cherryVariety: true,
                },
              },
            },
          },
          priceSetter: {
            select: {
              id: true,
              name: true,
            },
          },
          // A roaster gets only the rows into their own stock on a lot they
          // hold or see on the shelf (lib/farmAccess chainScope).
          withdrawalHistory: {
            where: scope ? scope.greenWithdrawalWhere : {},
            include: {
              withdrawnByUser: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { date: 'desc' },
          },
          _count: {
            select: { cuppingScores: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.greenBeanLot.count({ where }),
    ])

    return NextResponse.json({
      // Withdrawal sale details and purpose only for the lot's owner and Admin;
      // the parchment's importer only for Admin and the importer.
      greenBeanLots: greenBeanLots.map(lot => withParchmentImporterFor(user, greenBeanLotForViewer(user, lot))),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/green-bean-lots - Create new green bean lot
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Processors and Admins create internal lots; Roasters can add
    // purchased external lots from the Roaster Workbench (checked below).
    requireRole(user, ['Processor', 'Roaster', 'Admin'])
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited

    // Validate request body with Zod
    const validation = await validateBody(request, createGreenBeanLotSchema)
    if (!validation.success) {
      return validation.error
    }

    // createGreenBeanLotSchema doesn't declare `processorScore`, but the route
    // historically accepts it from clients that send a pre-cupping processor
    // score. Treat it as an unknown extra field we'll coerce below.
    const {
      sourceType,
      parchmentLotId,
      grade,
      initialWeightKg,
      currentWeightKg,
      externalSource,
      availabilityStatus,
      pricePerKg,
      currency,
      ownerId: buyingFor,
    } = validation.data
    const processorScore = (validation.data as { processorScore?: unknown }).processorScore

    // SECURITY: The lot's owner (createdById) can sell, roast and withdraw
    // it. A lot that names a parchment lot belongs to that parchment's owner
    // (parchmentLot -> processingBatch.createdById); with no parchment, or
    // none with an owner on record, it is the caller's. So a non-Admin may
    // only name parchment they processed, or anyone could mint stock that
    // traces back to another processor's batch and farm; Admin and super
    // admin may name any, and the lot is then the processor's, not theirs.
    // Internal lots come out of processing; a Roaster adds the External lots
    // they buy.
    if (sourceType === 'Internal') {
      requireRole(user, ['Processor', 'Admin'])
    }
    // The owner, as above: a lot an Admin records from a processor's
    // parchment is that processor's to price, sell and withdraw.
    let ownerId = user.id
    if (parchmentLotId) {
      const parchmentLot = await prisma.parchmentLot.findUnique({
        where: { id: parchmentLotId },
        select: { processingBatch: { select: { createdById: true } } },
      })
      if (!parchmentLot) {
        return NextResponse.json(
          { error: 'Parchment lot not found' },
          { status: 404 },
        )
      }
      requireOwnership(user, parchmentLot.processingBatch?.createdById, ['Admin'])
      ownerId = parchmentLot.processingBatch?.createdById ?? user.id
    }

    // An Admin buying a purchased lot for a roaster (the Workbench's "Buying
    // for") names them in ownerId, and the lot is that roaster's: they roast,
    // sell, edit and delete it, as with the other Admin-on-behalf records.
    // Naming yourself is the same as naming no one.
    const buyerId = buyingFor && buyingFor !== user.id ? buyingFor : null
    if (buyerId) {
      if (!isAdminUser(user)) {
        return NextResponse.json(
          { error: 'Only an admin can add a lot for another roaster' },
          { status: 403 },
        )
      }
      // A lot from parchment is its processor's (above), never a buyer's.
      if (sourceType !== 'External' || parchmentLotId) {
        return NextResponse.json(
          { error: 'Only a purchased (External) lot can be added for a roaster' },
          { status: 400 },
        )
      }
      const buyer = await prisma.user.findUnique({
        where: { id: buyerId },
        select: { roles: true, isActive: true },
      })
      if (!buyer || !buyer.isActive || !buyer.roles.includes('Roaster')) {
        return NextResponse.json({ error: 'Choose an active roaster to buy for' }, { status: 400 })
      }
      ownerId = buyerId
    }

    // Prisma JSON fields cannot serialize nested undefined values from optional form fields.
    const cleanExternalSource = externalSource
      ? Object.fromEntries(
          Object.entries(externalSource).filter(([, value]) => value !== undefined),
        )
      : undefined

    const greenBeanLot = await withDisplayIdRetry(async () => {
      const displayId = await nextDisplayId(prisma.greenBeanLot, 'GBL')
      return prisma.greenBeanLot.create({
        data: {
          displayId,
          sourceType,
          parchmentLotId: parchmentLotId || null,
          createdById: ownerId,
          grade,
          initialWeightKg,
          currentWeightKg: currentWeightKg || initialWeightKg,
          availabilityStatus: availabilityStatus || 'Available',
          externalSource: cleanExternalSource || undefined,
          processorScore: processorScore ? parseFloat(String(processorScore)) : null,
          pricePerKg: pricePerKg ? parseFloat(String(pricePerKg)) : null,
          currency: currency || null,
        },
        include: {
          parchmentLot: {
            include: {
              processingBatch: {
                select: {
                  id: true,
                  processType: true,
                },
              },
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
      })
    })

    return NextResponse.json(
      { greenBeanLot, message: 'Green bean lot created successfully' },
      { status: 201 },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
