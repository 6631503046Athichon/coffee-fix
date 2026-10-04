import { NextRequest, NextResponse } from 'next/server'
import type { GreenBeanLot } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import {
  safeParseFloat,
  parseStrictNumber,
  todayDateOnly,
  nextDisplayIds,
  withDisplayIdRetry,
} from '@/lib/utils'
import { isActiveRoaster, INVALID_TARGET_ROASTER_MESSAGE } from '@/lib/targetRoaster'
import { createParchmentWithdrawalSchema } from '@/lib/validations/parchmentLot'
import { BODY_NOT_OBJECT_MESSAGE, readJsonObjectBody } from '@/lib/withdrawalVoid'

// The fields createParchmentWithdrawalSchema checks here: a wrong type is a
// 400, not a database error, and a Sale's price must be above 0 with at most
// 2 decimals, in a known currency. The kg, the target roaster and the Hull &
// Grade lots keep their own checks below (the kg may come as a numeric
// string and must fit the lot; the roaster must be an active Roaster; each
// graded lot gets its own message). cuppingScore is read as it always was.
const withdrawalFieldsSchema = createParchmentWithdrawalSchema.pick({
  withdrawalType: true,
  purpose: true,
  notes: true,
  salePrice: true,
  currency: true,
  customerName: true,
  invoiceNumber: true,
  deliveryAddress: true,
  roastProfileNotes: true,
})

// POST /api/parchment-lots/:id/withdrawals - Create withdrawal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Processor', 'Roaster', 'Admin'])
    // Per-user write limiter: stops a stuck retry loop or scripted abuse
    // from generating thousands of withdrawal records.
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
    const {
      amountKg, withdrawalType, purpose,
      targetRoasterId, cuppingScore,
      gradedLots, totalGreenBeanWeight,
    } = body as Record<string, any>

    if (amountKg === undefined || !withdrawalType || !purpose) {
      return NextResponse.json(
        { error: 'Amount, withdrawal type, and purpose are required' },
        { status: 400 }
      )
    }

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

    // Get current lot (with batch creator for ownership check)
    const lot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        processingBatch: { select: { createdById: true } },
      },
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Parchment lot not found' },
        { status: 404 }
      )
    }

    // SECURITY: Only the Processor who created the parent ProcessingBatch
    // (or Admin / super admin) can draw down this lot, whatever the
    // withdrawal type. RoastingStock included: it takes the kg off the lot
    // without giving the roaster any inventory, so letting a Roaster draw it
    // on someone else's lot only destroys stock.
    requireOwnership(user, lot.processingBatch?.createdById, ['Admin'])

    // Green beans hulled here belong to the parchment's owner, so a Hull &
    // Grade an Admin does on a processor's lot leaves the lots with that
    // processor to price, sell and withdraw. A lot with no batch owner on
    // record (bought-in parchment) is Admin-only, and its lots are the caller's.
    const greenBeanOwnerId = lot.processingBatch?.createdById ?? user.id

    const amount = safeParseFloat(amountKg)
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

    // The withdrawal row names this user as the roaster the kg went to.
    if (targetRoasterId && !(await isActiveRoaster(targetRoasterId))) {
      return NextResponse.json(
        { error: INVALID_TARGET_ROASTER_MESSAGE },
        { status: 400 }
      )
    }

    // Validate HullAndGrade specific fields
    if (withdrawalType === 'HullAndGrade') {
      if (!gradedLots || !Array.isArray(gradedLots) || gradedLots.length === 0) {
        return NextResponse.json(
          { error: 'Graded lots are required for Hull & Grade withdrawal' },
          { status: 400 }
        )
      }

      const declaredGreenWeight = safeParseFloat(totalGreenBeanWeight)
      let gradedWeightSum = 0
      const seenGrades = new Set<string>()

      for (let i = 0; i < gradedLots.length; i++) {
        const gl = gradedLots[i]
        const grade = typeof gl?.grade === 'string' ? gl.grade.trim() : ''
        const weight = safeParseFloat(gl?.weight)

        if (!grade || weight === null || weight <= 0) {
          return NextResponse.json(
            { error: 'Each graded lot must include a unique grade and a weight greater than 0' },
            { status: 400 }
          )
        }

        if (seenGrades.has(grade)) {
          return NextResponse.json(
            { error: `Duplicate grade is not allowed: ${grade}` },
            { status: 400 }
          )
        }

        // Price is optional (empty or 0 = no price), but a value that is
        // present must be a plain, non-negative number ("150abc" is refused).
        const rawPrice = gl?.price
        if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
          const glPrice = parseStrictNumber(rawPrice)
          if (glPrice === null || glPrice < 0) {
            return NextResponse.json(
              { error: `Price per kg for ${grade} must be a number of 0 or more` },
              { status: 400 }
            )
          }
          // THB to the satang, as the form allows: 220.555 is refused rather
          // than stored and audited with a third decimal.
          if (Math.abs(glPrice * 100 - Math.round(glPrice * 100)) > 1e-6) {
            return NextResponse.json(
              { error: `Price per kg for ${grade} must have at most 2 decimals` },
              { status: 400 }
            )
          }
        }

        seenGrades.add(grade)
        gradedWeightSum += weight
      }

      const effectiveGreenWeight = declaredGreenWeight ?? gradedWeightSum
      if (effectiveGreenWeight <= 0) {
        return NextResponse.json(
          { error: 'Total green bean weight must be greater than 0' },
          { status: 400 }
        )
      }

      if (effectiveGreenWeight - amount > 0.01) {
        return NextResponse.json(
          { error: 'Total green bean weight cannot exceed the parchment amount withdrawn' },
          { status: 400 }
        )
      }

      if (declaredGreenWeight !== null && Math.abs(gradedWeightSum - declaredGreenWeight) > 0.01) {
        return NextResponse.json(
          { error: 'The sum of graded lots must exactly match the declared total green bean weight' },
          { status: 400 }
        )
      }
    }

    // Calculate total amount for sales
    const price = fields.salePrice ?? null
    const totalAmount = fields.withdrawalType === 'Sale' && price !== null
      ? amount * price
      : null

    // Allocate sequential displayIds in a single max-read. Looping over
    // `nextDisplayId` would return the same string each iteration because the
    // prior tx.create rows aren't committed yet — `nextDisplayIds(N)` returns
    // [max+1 .. max+N] from one read. Wrap the entire transaction in the
    // retry helper so concurrent allocators rewind the whole withdrawal +
    // green-bean creates if displayId collides at commit time.
    // Resolves to the green bean lots a Hull & Grade created (empty for any
    // other type), so the response can hand them back with their prices.
    const createdGreenBeanLots = await withDisplayIdRetry(async () => {
      const greenBeanDisplayIds: string[] =
        withdrawalType === 'HullAndGrade' && gradedLots
          ? await nextDisplayIds(prisma.greenBeanLot, 'GBL', gradedLots.length)
          : []

      return prisma.$transaction(async (tx) => {
      const createdLots: GreenBeanLot[] = []

      // Atomic decrement with a where guard so two concurrent withdrawals
      // cannot both pass the up-front amount-vs-currentWeight check and end
      // up double-spending the lot. updateMany compiles to a single SQL
      // UPDATE that Postgres serialises at the row level, so the loser sees
      // count === 0 and we abort the whole transaction.
      const guarded = await tx.parchmentLot.updateMany({
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

      // Create withdrawal record
      const withdrawal = await tx.parchmentWithdrawal.create({
        data: {
          parchmentLotId: id,
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
          targetRoasterId: targetRoasterId || null,
          roastProfileNotes: fields.roastProfileNotes || null,
          cuppingScore: safeParseFloat(cuppingScore),
        },
      })

      // Re-read the post-decrement weight to clamp float residue and decide
      // status. We treat residue < 0.01 kg as fully depleted so float dust
      // (e.g. 1e-15 kg) doesn't leave lots stuck in AwaitingHulling.
      const fresh = await tx.parchmentLot.findUnique({
        where: { id },
        select: { currentWeightKg: true },
      })
      const rawRemaining = fresh?.currentWeightKg ?? 0
      const finalWeight = rawRemaining < 0.01 ? 0 : parseFloat(rawRemaining.toFixed(6))
      const statusUpdate: any = { currentWeightKg: finalWeight }
      // Once a parchment lot is fully depleted we mark it Hulled regardless of
      // the withdrawal type — HullAndGrade, Sale, Sample, Export, Other, and
      // RoastingStock all consume parchment, so none of them should leave a
      // depleted lot sitting in AwaitingHulling.
      if (finalWeight <= 0) statusUpdate.status = 'Hulled'
      await tx.parchmentLot.update({ where: { id }, data: statusUpdate })

      // If HullAndGrade, create green bean lots
      if (withdrawalType === 'HullAndGrade' && gradedLots) {
        // Today on Thai time, anchored at 12:00 UTC like a picked date, so a
        // lot hulled before 07:00 is not dated the previous (UTC) day.
        const pricedAt = todayDateOnly()
        for (let i = 0; i < gradedLots.length; i++) {
          const gl = gradedLots[i]
          const weight = safeParseFloat(gl.weight)
          const glPrice = parseStrictNumber(gl.price)
          const glScore = safeParseFloat(gl.score)
          // 0 or empty means the operator left the price for later.
          const setPrice = glPrice !== null && glPrice > 0 ? glPrice : null

          if (weight === null || weight <= 0) continue

          const createdLot = await tx.greenBeanLot.create({
            data: {
              displayId: greenBeanDisplayIds[i],
              sourceType: 'Internal',
              parchmentLotId: id,
              // The hull that made it, so voiding the hull can find it.
              parchmentWithdrawalId: withdrawal.id,
              grade: gl.grade,
              initialWeightKg: weight,
              currentWeightKg: weight,
              availabilityStatus: 'Available',
              createdById: greenBeanOwnerId,
              ...(setPrice !== null && {
                pricePerKg: setPrice,
                currency: 'THB',
                priceSetDate: pricedAt,
                priceSetBy: user.id,
              }),
              ...(glScore !== null && {
                processorScore: glScore,
              }),
            },
          })
          createdLots.push(createdLot)

          // A price set at hulling gets the same audit row as one set later.
          if (setPrice !== null) {
            await tx.pricingHistory.create({
              data: {
                greenBeanLotId: createdLot.id,
                pricePerKg: setPrice,
                currency: 'THB',
                effectiveDate: pricedAt,
                setBy: user.id,
              },
            })
          }
        }
      }

      // For RoastingStock with target roaster, create/update inventory
      if (targetRoasterId && (withdrawalType === 'RoastingStock')) {
        // Note: For parchment roasting stock, we don't create RoasterInventoryItem
        // since that requires a greenBeanLotId. The roast profile notes and cupping
        // score are stored in the withdrawal record itself.
      }

      return createdLots
      })
    })

    const updatedLot = await prisma.parchmentLot.findUnique({
      where: { id },
      include: {
        withdrawalHistory: {
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json(
      {
        parchmentLot: updatedLot,
        // The new lots as saved, price included, so the client can show them
        // before its next full reload.
        greenBeanLots: createdGreenBeanLots,
        message: 'Withdrawal created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
