import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { safeParseFloat } from '@/lib/utils'
import { isActiveRoaster, INVALID_TARGET_ROASTER_MESSAGE } from '@/lib/targetRoaster'
import { createWithdrawalSchema } from '@/lib/validations/greenBeanLot'
import { BODY_NOT_OBJECT_MESSAGE, readJsonObjectBody } from '@/lib/withdrawalVoid'

// The fields createWithdrawalSchema checks here: a wrong type is a 400, not a
// database error, and a Sale's price must be above 0 with at most 2 decimals,
// in a known currency. The kg and the target roaster keep their own checks
// below (the kg may come as a numeric string and must fit the lot; the
// roaster must be an active Roaster).
const withdrawalFieldsSchema = createWithdrawalSchema.pick({
  withdrawalType: true,
  purpose: true,
  notes: true,
  salePrice: true,
  currency: true,
  customerName: true,
  invoiceNumber: true,
  deliveryAddress: true,
})

// POST /api/green-bean-lots/:id/withdrawals - Create withdrawal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    // SECURITY: Only Processor, Roaster, and Admin can create withdrawals.
    // A Roaster passes here only for lots they created (green beans they
    // bought); the ownership check below refuses everyone else's.
    requireRole(user, ['Processor', 'Roaster', 'Admin'])
    // Per-user write limiter against retry-loop / scripted abuse.
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    })
    if (limited) return limited
    const { id } = await params

    const body = await readJsonObjectBody(request)
    if (!body) {
      return NextResponse.json({ error: BODY_NOT_OBJECT_MESSAGE }, { status: 400 })
    }
    const { amountKg, withdrawalType, purpose, targetRoasterId } = body as Record<string, any>

    // Presence check: distinguish "field missing" from "field has invalid value".
    // A literal 0, negative number, NaN (serialised as null by JSON.stringify),
    // or non-numeric string should reach the parsing branch below so the error
    // is the more specific "Invalid amount" rather than "required".
    if (amountKg === undefined || !withdrawalType || !purpose) {
      return NextResponse.json(
        { error: 'Amount, withdrawal type, and purpose are required' },
        { status: 400 }
      )
    }

    // Roasting Stock withdrawal requires a target roaster
    if (withdrawalType === 'RoastingStock' && !targetRoasterId) {
      return NextResponse.json(
        { error: 'Target roaster is required for Roasting Stock withdrawal' },
        { status: 400 }
      )
    }

    const parsed = withdrawalFieldsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid withdrawal' },
        { status: 400 }
      )
    }
    const fields = parsed.data

    // Any withdrawal with a targetRoasterId routes stock to that roaster's inventory

    // Get current lot
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Only the lot creator (or Admin / super admin) can draw down
    // the lot, whatever the withdrawal type. A Roaster takes stock from
    // someone else's lot through POST /api/roaster-inventory (the claim),
    // which checks the lot is Available; this route would let them skip that
    // and record a Sale on a lot that is not theirs.
    requireOwnership(user, lot.createdById, ['Admin'])

    const amount = safeParseFloat(amountKg);
    if (amount === null || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    if (amount > lot.currentWeightKg) {
      return NextResponse.json(
        { error: 'Insufficient weight available' },
        { status: 400 }
      )
    }

    // The kg go into this user's inventory, so it must be a roaster who can
    // open it (see lib/targetRoaster).
    if (targetRoasterId && !(await isActiveRoaster(targetRoasterId))) {
      return NextResponse.json(
        { error: INVALID_TARGET_ROASTER_MESSAGE },
        { status: 400 }
      )
    }

    // Calculate total amount for sales
    const price = fields.salePrice ?? null
    const totalAmount = fields.withdrawalType === 'Sale' && price !== null
      ? amount * price
      : null

    await prisma.$transaction(async (tx) => {
      // Atomic decrement with a where guard so two concurrent withdrawals
      // cannot both pass the up-front check and overdraw the lot.
      const guarded = await tx.greenBeanLot.updateMany({
        where: { id, currentWeightKg: { gte: amount } },
        data: { currentWeightKg: { decrement: amount } },
      })
      if (guarded.count === 0) {
        // Another withdrawal took the kg first: a 409 the client can show
        // (handleApiError keeps only a 4xx statusCode's message).
        throw Object.assign(
          new Error('Insufficient weight (concurrent withdrawal contention)'),
          { statusCode: 409 },
        )
      }

      // Create withdrawal
      await tx.greenBeanWithdrawal.create({
        data: {
          greenBeanLotId: id,
          amountKg: amount,
          withdrawalType: fields.withdrawalType,
          purpose: fields.purpose,
          notes: fields.notes || null,
          withdrawnBy: user.id,
          withdrawnByName: user.name,
          salePrice: price,
          currency: fields.currency ?? null,
          customerName: fields.customerName || null,
          invoiceNumber: fields.invoiceNumber || null,
          deliveryAddress: fields.deliveryAddress || null,
          totalAmount,
          // The roaster whose stock the kg go into below, so a void can take
          // them back off it.
          targetRoasterId: targetRoasterId || null,
        },
      })

      // Re-read post-decrement to clamp float residue and decide status.
      const fresh = await tx.greenBeanLot.findUnique({
        where: { id },
        select: { currentWeightKg: true },
      })
      const rawRemaining = fresh?.currentWeightKg ?? 0
      const finalWeight = rawRemaining < 0 ? 0 : parseFloat(rawRemaining.toFixed(6))
      await tx.greenBeanLot.update({
        where: { id },
        data: {
          currentWeightKg: finalWeight,
          ...(finalWeight <= 0 && { availabilityStatus: 'Withdrawn' }),
        },
      })

      // For any withdrawal with a target roaster: auto-create or update RoasterInventoryItem
      if (targetRoasterId) {
        const existingInventoryItem = await tx.roasterInventoryItem.findFirst({
          where: {
            roasterId: targetRoasterId,
            greenBeanLotId: id,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })

        if (existingInventoryItem) {
          await tx.roasterInventoryItem.update({
            where: { id: existingInventoryItem.id },
            data: {
              claimedWeightKg: { increment: amount },
              remainingWeightKg: { increment: amount },
            },
          })
        } else {
          await tx.roasterInventoryItem.create({
            data: {
              roasterId: targetRoasterId,
              greenBeanLotId: id,
              claimedWeightKg: amount,
              remainingWeightKg: amount,
            },
          })
        }
      }
    })

    const updatedLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        withdrawalHistory: {
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
      },
    })

    // Fetch the created/updated inventory item if this withdrawal had a target roaster
    let roasterInventoryItem = null
    if (targetRoasterId) {
      roasterInventoryItem = await prisma.roasterInventoryItem.findFirst({
        where: {
          roasterId: targetRoasterId,
          greenBeanLotId: id,
        },
        orderBy: { createdAt: 'desc' },
      })
    }

    return NextResponse.json(
      {
        greenBeanLot: updatedLot,
        roasterInventoryItem,
        message: 'Withdrawal created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
