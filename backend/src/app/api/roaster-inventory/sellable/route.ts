import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { greenStockSelect, sellableOwnerWhere, serializeGreenStock } from '@/lib/saleOrders'

// Same cut as the Roaster Workbench's Internal Lots list: at or below 10 g a
// stock row is not offered.
const MIN_SELLABLE_KG = 0.01

// GET /api/roaster-inventory/sellable - Green beans left in the seller's stock
// Feeds the Sell popup next to /api/roast-batches/sellable. Roasters only ever
// get their own stock; an Admin may pass ?roasterId to load the stock of the
// roaster who owns a sale, or ?roasterId=all for every stock they can sell.
// Each row names its owner.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Roaster', 'Admin'])

    const owner = sellableOwnerWhere(user, request.nextUrl.searchParams.get('roasterId'))

    const rows = await prisma.roasterInventoryItem.findMany({
      where: { ...owner, remainingWeightKg: { gt: MIN_SELLABLE_KG } },
      select: { ...greenStockSelect, roaster: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })

    const greenLots = rows.map((row) => ({
      ...serializeGreenStock(row),
      roasterId: row.roasterId,
      roasterName: row.roaster?.name,
    }))
    return NextResponse.json({ greenLots })
  } catch (error) {
    return handleApiError(error)
  }
}
