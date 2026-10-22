import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { roastSummarySelect, sellableOwnerWhere, serializeRoastSummary } from '@/lib/saleOrders'

// Below half a gram left, a roast counts as sold out.
const SOLD_OUT_KG = 0.0005

// GET /api/roast-batches/sellable - Roasts with roasted coffee left to sell
// Feeds the Sell popup. bulk-load caps roastBatches at the newest 100, so the
// popup asks here instead. Roasters only ever get their own roasts; an Admin
// may pass ?roasterId to load the roasts of the roaster who owns a sale, or
// ?roasterId=all for every roast they can sell. Each roast names its owner.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const owner = sellableOwnerWhere(user, request.nextUrl.searchParams.get('roasterId'))

    const [batches, missingWeightCount] = await Promise.all([
      prisma.roastBatch.findMany({
        where: { ...owner, roastedWeightKg: { not: null } },
        select: { ...roastSummarySelect, roaster: { select: { name: true } } },
        orderBy: { roastDate: 'desc' },
      }),
      // Roasts logged without a roasted weight can't be sold until it is added.
      prisma.roastBatch.count({ where: { ...owner, roastedWeightKg: null } }),
    ])

    const roastBatches = batches
      .map((batch) => ({
        ...serializeRoastSummary(batch),
        roasterId: batch.roasterId,
        roasterName: batch.roaster?.name,
      }))
      .filter((batch) => batch.availableKg > SOLD_OUT_KG)

    return NextResponse.json({ roastBatches, missingWeightCount })
  } catch (error) {
    return handleApiError(error)
  }
}
