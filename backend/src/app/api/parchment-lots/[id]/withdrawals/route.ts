import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireOwnership, requireRole, handleApiError } from '@/lib/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { safeParseFloat, nextDisplayIds, withDisplayIdRetry } from '@/lib/utils'

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

    const body = await request.json()
    const {
      amountKg, withdrawalType, purpose, notes,
      salePrice, currency, customerName, deliveryAddress,
      targetRoasterId, roastProfileNotes, cuppingScore,
      gradedLots, totalGreenBeanWeight,
    } = body

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
    // (or Admin) can draw down this lot. Roasters reaching this endpoint via
    // RoastingStock flows are covered by their own inventory endpoints.
    requireOwnership(user, lot.processingBatch?.createdById, ['Admin', 'Roaster'])

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
    const price = safeParseFloat(salePrice)
    const totalAmount = withdrawalType === 'Sale' && price !== null
      ? amount * price
      : null

    // Allocate sequential displayIds in a single max-read. Looping over
    // `nextDisplayId` would return the same string each iteration because the
    // prior tx.create rows aren't committed yet — `nextDisplayIds(N)` returns
    // [max+1 .. max+N] from one read. Wrap the entire transaction in the
    // retry helper so concurrent allocators rewind the whole withdrawal +
    // green-bean creates if displayId collides at commit time.
    await withDisplayIdRetry(async () => {
      const greenBeanDisplayIds: string[] =
        withdrawalType === 'HullAndGrade' && gradedLots
          ? await nextDisplayIds(prisma.greenBeanLot, 'GBL', gradedLots.length)
          : []

      await prisma.$transaction(async (tx) => {
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
        throw new Error('Insufficient weight (concurrent withdrawal contention)')
      }

      // Create withdrawal record
      await tx.parchmentWithdrawal.create({
        data: {
          parchmentLotId: id,
          amountKg: amount,
          withdrawalType,
          purpose,
          notes: notes || null,
          withdrawnBy: user.id,
          withdrawnByName: user.name,
          salePrice: price,
          currency: currency || null,
          customerName: customerName || null,
          deliveryAddress: deliveryAddress || null,
          totalAmount,
          targetRoasterId: targetRoasterId || null,
          roastProfileNotes: roastProfileNotes || null,
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
        for (let i = 0; i < gradedLots.length; i++) {
          const gl = gradedLots[i]
          const weight = safeParseFloat(gl.weight)
          const glPrice = safeParseFloat(gl.price)
          const glScore = safeParseFloat(gl.score)

          if (weight === null || weight <= 0) continue

          await tx.greenBeanLot.create({
            data: {
              displayId: greenBeanDisplayIds[i],
              sourceType: 'Internal',
              parchmentLotId: id,
              grade: gl.grade,
              initialWeightKg: weight,
              currentWeightKg: weight,
              availabilityStatus: 'Available',
              createdById: user.id,
              ...(glPrice !== null && {
                pricePerKg: glPrice,
                currency: 'THB',
              }),
              ...(glScore !== null && {
                processorScore: glScore,
              }),
            },
          })
        }
      }

      // For RoastingStock with target roaster, create/update inventory
      if (targetRoasterId && (withdrawalType === 'RoastingStock')) {
        // Note: For parchment roasting stock, we don't create RoasterInventoryItem
        // since that requires a greenBeanLotId. The roast profile notes and cupping
        // score are stored in the withdrawal record itself.
      }
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
        message: 'Withdrawal created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
