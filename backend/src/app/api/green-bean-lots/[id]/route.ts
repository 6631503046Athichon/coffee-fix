import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, requireOwnership, requireRole, handleApiError } from "@/lib/middleware";
import {
  safeParseFloat,
  parseStrictDateOnly,
  parseStrictNumber,
  todayDateOnly,
} from "@/lib/utils";
import {
  currencySchema,
  greenBeanAvailabilityStatusSchema,
} from "@/lib/validations/common";
import { greenBeanLotForViewer } from "@/lib/withdrawalPrivacy";

// GET /api/green-bean-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const greenBeanLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        parchmentLot: {
          include: {
            processingBatch: {
              include: {
                harvestLot: {
                  include: {
                    farm: {
                      select: {
                        id: true,
                        farmName: true,
                        location: true,
                      },
                    },
                  },
                },
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
        cuppingScores: true,
        withdrawalHistory: {
          include: {
            withdrawnByUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { date: "desc" },
        },
        roasterInventory: {
          include: {
            roaster: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        // Column-listed so a roaster's sold kg (RoastBatch.soldWeightKg)
        // never reaches whoever opens the lot.
        roastBatches: {
          select: {
            id: true,
            roasterId: true,
            roasterInventoryId: true,
            greenBeanLotId: true,
            roastDate: true,
            batchSizeKg: true,
            yieldPercentage: true,
            roastedWeightKg: true,
            weightLossPct: true,
            roastLevel: true,
            roastProfileNotes: true,
            flavorNotes: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { roastDate: "desc" },
        },
      },
    });

    if (!greenBeanLot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }

    // Withdrawal sale details and other roasters' stock rows only for the
    // lot's owner and Admin; see lib/withdrawalPrivacy.
    return NextResponse.json({
      greenBeanLot: greenBeanLotForViewer(user, greenBeanLot),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/green-bean-lots/:id (for processorScore updates)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    // SECURITY: Only Processor and Admin can update processor scores
    requireRole(user, ['Processor', 'Admin']);
    const { id } = await params;

    // SECURITY: Ownership check — only the Processor who created this lot
    // (or Admin) can update its scores.
    const existingScoreLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: { createdById: true },
    });
    if (!existingScoreLot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }
    requireOwnership(user, existingScoreLot.createdById, ['Admin']);

    const body = await request.json();
    const {
      processorScore,
      cuppingFragrance,
      cuppingFlavor,
      cuppingAftertaste,
      cuppingAcidity,
      cuppingBody,
      cuppingBalance,
      cuppingOverall,
      cuppingUniformity,
      cuppingCleanCup,
      cuppingSweetness,
    } = body;

    const updateData: Record<string, number> = {};
    const fieldsToUpdate: Record<string, unknown> = {
      processorScore,
      cuppingFragrance,
      cuppingFlavor,
      cuppingAftertaste,
      cuppingAcidity,
      cuppingBody,
      cuppingBalance,
      cuppingOverall,
      cuppingUniformity,
      cuppingCleanCup,
      cuppingSweetness,
    };

    let hasUpdates = false;
    for (const [field, value] of Object.entries(fieldsToUpdate)) {
      if (value === undefined) continue;
      const parsed = safeParseFloat(value);
      if (parsed === null) {
        return NextResponse.json(
          { error: `Invalid ${field} value` },
          { status: 400 },
        );
      }
      updateData[field] = parsed;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return NextResponse.json(
        { error: "No valid score fields provided" },
        { status: 400 },
      );
    }

    const updatedLot = await prisma.greenBeanLot.update({
      where: { id },
      data: updateData,
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
      },
    });

    return NextResponse.json({ greenBeanLot: updatedLot });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/green-bean-lots/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    // SECURITY: Only Processor and Admin can update green bean lots
    requireRole(user, ['Processor', 'Admin']);
    const { id } = await params;

    const existingLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: {
        id: true,
        currentWeightKg: true,
        availabilityStatus: true,
        createdById: true,
        currency: true,
      },
    });

    if (!existingLot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }

    // SECURITY: Ownership check — only the Processor who created this lot
    // (or Admin) can mutate it.
    requireOwnership(user, existingLot.createdById, ['Admin']);

    const body = await request.json();
    const {
      grade,
      currentWeightKg,
      availabilityStatus,
      pricePerKg,
      currency,
      priceSetDate,
    } = body;

    // Use UncheckedUpdateInput so we can assign scalar FKs (priceSetBy) directly
    // without needing a nested `connect`.
    const updateData: Prisma.GreenBeanLotUncheckedUpdateInput = {};
    if (grade !== undefined) updateData.grade = grade;
    let nextWeight = existingLot.currentWeightKg;
    if (currentWeightKg !== undefined) {
      const weight = safeParseFloat(currentWeightKg);
      if (weight === null || weight < 0) {
        return NextResponse.json(
          { error: "Invalid currentWeightKg value" },
          { status: 400 },
        );
      }
      nextWeight = weight;
      updateData.currentWeightKg = weight;
    }
    let parsedAvailability: "Available" | "Withdrawn" | undefined;
    if (availabilityStatus !== undefined) {
      const statusResult =
        greenBeanAvailabilityStatusSchema.safeParse(availabilityStatus);
      if (!statusResult.success) {
        return NextResponse.json(
          { error: "Invalid availabilityStatus value" },
          { status: 400 },
        );
      }
      parsedAvailability = statusResult.data;
    }
    if (nextWeight <= 0) {
      updateData.availabilityStatus = 'Withdrawn';
    } else if (parsedAvailability !== undefined) {
      updateData.availabilityStatus = parsedAvailability;
    }

    // Currency and priceSetDate describe a price, so they only change with
    // one: on their own they would re-denominate or re-date the current price
    // with no pricing-history row and a misleading priceSetBy.
    if (
      pricePerKg === undefined &&
      (currency !== undefined || priceSetDate !== undefined)
    ) {
      return NextResponse.json(
        { error: "currency and priceSetDate can only be sent together with pricePerKg" },
        { status: 400 },
      );
    }

    // Parse priceSetDate once; it doubles as the pricing-history effective
    // date. A picked calendar date (YYYY-MM-DD) is anchored at 12:00 UTC so it
    // reads as the same day in every timezone; an impossible day is refused.
    const parsedPriceSetDate = priceSetDate
      ? parseStrictDateOnly(priceSetDate)
      : null;
    if (parsedPriceSetDate && Number.isNaN(parsedPriceSetDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid priceSetDate value" },
        { status: 400 },
      );
    }

    // Setting a price always stamps who set it and when, and always leaves a
    // pricing-history row behind (written in the transaction below).
    let priceEntry: {
      pricePerKg: number;
      currency: string;
      effectiveDate: Date;
    } | null = null;
    if (pricePerKg !== undefined) {
      const parsedPrice = parseStrictNumber(pricePerKg);
      if (parsedPrice === null || parsedPrice <= 0) {
        return NextResponse.json(
          { error: "pricePerKg must be a number greater than 0" },
          { status: 400 },
        );
      }
      const currencyResult = currencySchema.safeParse(
        currency ?? existingLot.currency ?? "THB",
      );
      if (!currencyResult.success) {
        return NextResponse.json(
          { error: "Invalid currency value" },
          { status: 400 },
        );
      }
      // No date sent: today on Thai time, anchored like a picked date.
      const effectiveDate = parsedPriceSetDate ?? todayDateOnly();
      updateData.pricePerKg = parsedPrice;
      updateData.currency = currencyResult.data;
      updateData.priceSetDate = effectiveDate;
      updateData.priceSetBy = user.id;
      priceEntry = {
        pricePerKg: parsedPrice,
        currency: currencyResult.data,
        effectiveDate,
      };
    }

    // Update the lot AND write the pricing-history audit row in a single
    // transaction. Previously the audit log was a fire-and-forget call after
    // the update committed — if the audit insert failed, the price change
    // silently persisted with no history record. Wrapping both ensures the
    // price update rolls back together with the audit on any failure.
    const updatedLot = await prisma.$transaction(async (tx) => {
      const lot = await tx.greenBeanLot.update({
        where: { id },
        data: updateData,
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
          // Same shape as bulk-load, so a caller that swaps in the returned
          // lot keeps its withdrawal history instead of wiping it.
          withdrawalHistory: {
            include: {
              withdrawnByUser: {
                select: { id: true, name: true },
              },
            },
            orderBy: { date: "desc" },
          },
        },
      });

      // Every price set leaves an audit row, whether or not the caller sent
      // a currency (it falls back to the lot's currency, then THB).
      if (priceEntry) {
        await tx.pricingHistory.create({
          data: {
            greenBeanLotId: id,
            pricePerKg: priceEntry.pricePerKg,
            currency: priceEntry.currency,
            effectiveDate: priceEntry.effectiveDate,
            setBy: user.id,
          },
        });
      }

      return lot;
    });

    return NextResponse.json({ greenBeanLot: updatedLot });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/green-bean-lots/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    // SECURITY: Only Processor and Admin can delete green bean lots
    requireRole(user, ['Processor', 'Admin']);
    const { id } = await params;

    // Check if lot exists
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        roasterInventory: true,
        // Only the count matters here.
        roastBatches: { select: { id: true } },
      },
    });

    if (!lot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }

    // SECURITY: Ownership check — only the Processor who created this lot
    // (or Admin) can delete it.
    requireOwnership(user, lot.createdById, ['Admin']);

    // Check if there are roaster inventory or roast batches linked
    if (
      (lot.roasterInventory && lot.roasterInventory.length > 0) ||
      (lot.roastBatches && lot.roastBatches.length > 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot delete green bean lot with linked roaster inventory or roast batches.",
        },
        { status: 400 },
      );
    }

    // CuppingScore, GreenBeanWithdrawal, and PricingHistory all cascade on
    // delete in the schema, so a single transactional delete is atomic — no
    // separate deleteMany() calls are needed.
    await prisma.$transaction(async (tx) => {
      await tx.greenBeanLot.delete({
        where: { id },
      });
    });

    return NextResponse.json({
      message: "Green bean lot deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
