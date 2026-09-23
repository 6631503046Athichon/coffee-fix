import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { isAdminUser, roastSummarySelect, serializeRoastSummary } from '@/lib/saleOrders'

// Below half a gram left, a roast counts as sold out.
const SOLD_OUT_KG = 0.0005

// GET /api/roast-batches/sellable - Roasts with roasted coffee left to sell
// Feeds the Sell popup. bulk-load caps roastBatches at the newest 100, so the
// popup asks here instead. Roasters only ever get their own roasts; an Admin
// may pass ?roasterId to load the roasts of the roaster who owns a sale.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const requestedRoasterId = request.nextUrl.searchParams.get('roasterId')
    const roasterId = isAdminUser(user) && requestedRoasterId ? requestedRoasterId : user.id

    const [batches, missingWeightCount] = await Promise.all([
      prisma.roastBatch.findMany({
        where: { roasterId, roastedWeightKg: { not: null } },
        select: roastSummarySelect,
        orderBy: { roastDate: 'desc' },
      }),
      // Roasts logged without a roasted weight can't be sold until it is added.
      prisma.roastBatch.count({ where: { roasterId, roastedWeightKg: null } }),
    ])

    const roastBatches = batches
      .map((batch) => ({ ...serializeRoastSummary(batch), roasterId: batch.roasterId }))
      .filter((batch) => batch.availableKg > SOLD_OUT_KG)

    return NextResponse.json({ roastBatches, missingWeightCount })
  } catch (error) {
    return handleApiError(error)
  }
}
