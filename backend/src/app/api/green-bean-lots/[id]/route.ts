import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
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
import { withParchmentImporterFor } from "@/lib/importerPrivacy";
import {
  LOT_CHANGED,
  LOT_CHANGED_MESSAGE,
  belowOutMessage,
  describeDependents,
  hasDependents,
  reweighLot,
  type ReweighResult,
} from "@/lib/lotCorrections";
import { batchLabel, chainScope, requireInScope } from "@/lib/farmAccess";
import {
  GREEN_LOT_USES_COUNT,
  deleteUnusedGreenLots,
  greenLotDependents,
} from "@/lib/greenLotRemoval";
import {
  OverHullError,
  hullLimitOf,
  exceedsHull,
  madeByHullAndGrade,
  maxGreenKg,
} from "@/lib/hullGreenWeight";

// The processor's QC "Tasting Notes & Comments" (GreenBeanLot.qcNotes). Not
// exported: a route file may only export its handlers.
const QC_NOTES_MAX = 2000;

// The DELETE's guarded delete matched nothing: rolls its transaction back.
const GREEN_LOT_IN_USE = "GREEN_LOT_IN_USE";

// A purchased (External) lot's supplier details, as the Roaster Workbench's
// Add / Edit purchased lot form sends them. Each field is optional: what is
// left out keeps its saved value, and an empty optional text (or null)
// clears it. Origin, variety and process cannot be emptied.
const optionalText = (max: number, label: string) =>
  z
    .string({ message: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullable()
    .optional();
const requiredText = (max: number, label: string) =>
  z
    .string({ message: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`)
    .optional();
const externalSourceEditSchema = z
  .object({
    originName: requiredText(200, "Origin / supplier"),
    producerName: optionalText(200, "Producer"),
    variety: requiredText(100, "Variety"),
    processType: requiredText(100, "Process type"),
    purchaseDate: z
      .string({ message: "Purchase date must be a date" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Purchase date must be a date (YYYY-MM-DD)")
      .refine(
        (value) => !Number.isNaN(parseStrictDateOnly(value)?.getTime() ?? NaN),
        "Purchase date is not a real date",
      )
      .optional(),
    // 0 is "no price", as the Add External Lot form saves a blank price.
    pricePerKg: z
      .number({ message: "Price per kg must be a number" })
      .min(0, "Price per kg cannot be below 0")
      .optional(),
    currency: currencySchema.optional(),
    tasteNote: optionalText(500, "Taste note"),
    supplierNotes: optionalText(2000, "Supplier notes"),
  })
  .strict();

// GET /api/green-bean-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    // Each their own, as on the list (lib/farmAccess chainScope).
    const scope = await chainScope(user);

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
                farmId: true,
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
        // A roaster gets only the rows into their own stock on a lot they
        // hold or see on the shelf.
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

    // A lot outside the user's share is a 403.
    if (scope) {
      requireInScope(
        await prisma.greenBeanLot.findFirst({
          where: { id, AND: [scope.greenBeanLotWhere] },
          select: { id: true },
        }),
      );
    }

    // A roaster reads the parchment's batch only as a label for the lot,
    // not the processor's record.
    const batch = greenBeanLot.parchmentLot?.processingBatch;
    const shaped =
      scope && greenBeanLot.parchmentLot && batch && !scope.canReadBatch(batch)
        ? {
            ...greenBeanLot,
            parchmentLot: { ...greenBeanLot.parchmentLot, processingBatch: batchLabel(batch) },
          }
        : greenBeanLot;

    // Withdrawal sale details and purpose, and other roasters' stock rows,
    // only for the lot's owner and Admin; see lib/withdrawalPrivacy. The
    // parchment's importer only for Admin and the importer (lib/importerPrivacy).
    return NextResponse.json({
      greenBeanLot: withParchmentImporterFor(user, greenBeanLotForViewer(user, shaped)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/green-bean-lots/:id (for processorScore updates, with the QC
// Score popup's notes as qcNotes)
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
      qcNotes,
    } = body;

    const updateData: Record<string, number | string | null> = {};
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

    // The QC Score popup's "Tasting Notes & Comments": trimmed, and empty (or
    // null) clears them. Same owner-or-Admin rule as the score, checked above.
    if (qcNotes !== undefined) {
      if (qcNotes !== null && typeof qcNotes !== "string") {
        return NextResponse.json(
          { error: "QC notes must be text" },
          { status: 400 },
        );
      }
      const notes = typeof qcNotes === "string" ? qcNotes.trim() : "";
      if (notes.length > QC_NOTES_MAX) {
        return NextResponse.json(
          { error: `QC notes must be at most ${QC_NOTES_MAX} characters` },
          { status: 400 },
        );
      }
      updateData.qcNotes = notes || null;
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
    // SECURITY: Processors and Admins update green bean lots; a Roaster may
    // correct the purchased (External) lots they added (checked below).
    requireRole(user, ['Processor', 'Roaster', 'Admin']);
    const { id } = await params;

    const existingLot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: {
        id: true,
        initialWeightKg: true,
        currentWeightKg: true,
        availabilityStatus: true,
        createdById: true,
        currency: true,
        // Where the lot came from, for the Hull & Grade weight check below.
        sourceType: true,
        parchmentLotId: true,
        parchmentWithdrawalId: true,
        createdAt: true,
        // A purchased lot's supplier details, merged with an edit of them.
        externalSource: true,
      },
    });

    if (!existingLot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }

    // SECURITY: Ownership check — only the user who created this lot (or
    // Admin) can mutate it.
    requireOwnership(user, existingLot.createdById, ['Admin']);
    // A lot out of processing stays the Processor's (or Admin's) to correct;
    // a Roaster only ever owns the External lots they bought in.
    const isExternal = existingLot.sourceType === "External";
    if (!isExternal) {
      requireRole(user, ['Processor', 'Admin']);
    }

    const body = await request.json();
    const {
      grade,
      initialWeightKg,
      currentWeightKg,
      availabilityStatus,
      pricePerKg,
      currency,
      priceSetDate,
      externalSource,
    } = body;

    // Supplier details (origin, producer, variety, process, purchase date,
    // price, notes) belong to a purchased lot only. Sent fields replace the
    // saved ones; the rest stay.
    let nextExternalSource: Prisma.InputJsonObject | undefined;
    if (externalSource !== undefined) {
      if (!isExternal) {
        return NextResponse.json(
          { error: "Only a purchased (External) lot has supplier details" },
          { status: 400 },
        );
      }
      const parsedSource = externalSourceEditSchema.safeParse(externalSource);
      if (!parsedSource.success) {
        return NextResponse.json(
          {
            error:
              parsedSource.error.issues[0]?.message ||
              "Invalid supplier details",
          },
          { status: 400 },
        );
      }
      const saved =
        existingLot.externalSource &&
        typeof existingLot.externalSource === "object" &&
        !Array.isArray(existingLot.externalSource)
          ? (existingLot.externalSource as Record<string, unknown>)
          : {};
      const merged: Record<string, unknown> = { ...saved };
      for (const [key, value] of Object.entries(parsedSource.data)) {
        if (value === undefined) continue;
        // An emptied optional text is dropped, as the Add form leaves it out.
        if (value === null || value === "") delete merged[key];
        else merged[key] = value;
      }
      nextExternalSource = merged as Prisma.InputJsonObject;
    }

    // The kg left follows from the lot weight and what was already withdrawn,
    // sent to a roaster or sold, so it is never set directly: that would
    // erase or invent stock with no record of it.
    if (currentWeightKg !== undefined) {
      return NextResponse.json(
        {
          error:
            "The kg left follows from the lot weight and its withdrawals; send initialWeightKg to correct the weight",
        },
        { status: 400 },
      );
    }

    // Use UncheckedUpdateInput so we can assign scalar FKs (priceSetBy) directly
    // without needing a nested `connect`.
    const updateData: Prisma.GreenBeanLotUncheckedUpdateInput = {};
    if (nextExternalSource) {
      updateData.externalSource = nextExternalSource;
    }
    if (grade !== undefined) {
      const gradeName = typeof grade === "string" ? grade.trim() : "";
      if (!gradeName || gradeName.length > 50) {
        return NextResponse.json(
          { error: "Grade is required and must be at most 50 characters" },
          { status: 400 },
        );
      }
      updateData.grade = gradeName;
    }
    // A weight correction re-weighs the lot: the kg left moves by the same
    // amount, and the weight can never go below what already went out.
    let reweigh: Extract<ReweighResult, { ok: true }> | null = null;
    if (initialWeightKg !== undefined) {
      const weight = parseStrictNumber(initialWeightKg);
      if (weight === null || weight <= 0) {
        return NextResponse.json(
          { error: "Weight must be greater than 0" },
          { status: 400 },
        );
      }
      if (Math.abs(existingLot.initialWeightKg - weight) > 1e-9) {
        const result = reweighLot(existingLot, weight);
        if (!result.ok) {
          return NextResponse.json(
            {
              error: belowOutMessage("green bean lot", result.outKg),
              withdrawnKg: result.outKg,
            },
            { status: 409 },
          );
        }
        reweigh = result;
      }
    }
    const nextWeight = reweigh
      ? reweigh.currentWeightKg
      : existingLot.currentWeightKg;
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
    } else if (reweigh && existingLot.currentWeightKg <= 0) {
      // It was only Withdrawn because it ran out; the correction put kg back.
      updateData.availabilityStatus = 'Available';
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
    if (pricePerKg === null && isExternal) {
      // A purchased lot may be bought with no price on record (the Add form
      // leaves it blank), so its edit can take a typed price away again.
      // Nothing is priced, so there is no pricing-history row.
      updateData.pricePerKg = null;
      updateData.priceSetDate = null;
      updateData.priceSetBy = null;
    } else if (pricePerKg !== undefined) {
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

    // A lot a Hull & Grade made can only grow while that Hull & Grade's lots
    // still weigh no more than the parchment it hulled, as when it was
    // recorded (parchment-lots/:id/withdrawals). Lowering one never makes
    // that worse, so it is not checked.
    const checkHull =
      reweigh !== null &&
      reweigh.initialWeightKg > existingLot.initialWeightKg &&
      madeByHullAndGrade(existingLot);

    // Update the lot AND write the pricing-history audit row in a single
    // transaction. Previously the audit log was a fire-and-forget call after
    // the update committed — if the audit insert failed, the price change
    // silently persisted with no history record. Wrapping both ensures the
    // price update rolls back together with the audit on any failure.
    // A weight correction goes first, guarded on the weights as read: a
    // withdrawal in between makes it match nothing instead of being
    // overwritten, and the whole edit is refused. The Hull & Grade check
    // runs first, on the transaction.
    let updatedLot;
    try {
      updatedLot = await prisma.$transaction(async (tx) => {
        if (reweigh && checkHull) {
          // Parchment lot first, as a Hull & Grade and its void take it, so
          // two corrections of lots from one hull cannot both slip past.
          if (existingLot.parchmentLotId) {
            await tx.$queryRaw`SELECT "id" FROM "ParchmentLot" WHERE "id" = ${existingLot.parchmentLotId} FOR NO KEY UPDATE`;
          }
          const limit = await hullLimitOf(tx, existingLot);
          if (limit && exceedsHull(limit, reweigh.initialWeightKg)) {
            throw new OverHullError(limit);
          }
        }
        if (reweigh) {
          const guarded = await tx.greenBeanLot.updateMany({
            where: {
              id,
              initialWeightKg: existingLot.initialWeightKg,
              currentWeightKg: existingLot.currentWeightKg,
            },
            data: {
              initialWeightKg: reweigh.initialWeightKg,
              currentWeightKg: reweigh.currentWeightKg,
            },
          });
          if (guarded.count === 0) throw new Error(LOT_CHANGED);
        }

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
    } catch (error) {
      if ((error as Error)?.message === LOT_CHANGED) {
        return NextResponse.json(
          { error: LOT_CHANGED_MESSAGE },
          { status: 409 },
        );
      }
      if (error instanceof OverHullError) {
        return NextResponse.json(
          { error: error.message, maxWeightKg: maxGreenKg(error.limit) },
          { status: 400 },
        );
      }
      throw error;
    }

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
    // SECURITY: Processors and Admins delete green bean lots; a Roaster may
    // delete a purchased (External) lot they added (checked below).
    requireRole(user, ['Processor', 'Roaster', 'Admin']);
    const { id } = await params;

    // Check if lot exists, with what depends on it
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: {
        createdById: true,
        sourceType: true,
        parchmentLotId: true,
        parchmentWithdrawalId: true,
        parchmentLot: { select: { displayId: true } },
        // A voided withdrawal, and a roaster stock row at 0 kg with no roast
        // or sale (a voided push leaves one), go with the lot.
        _count: { select: GREEN_LOT_USES_COUNT },
      },
    });

    if (!lot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }

    // SECURITY: Ownership check — only the user who created this lot (or
    // Admin) can delete it, and a lot out of processing only a Processor
    // (or Admin): a Roaster only ever owns the External lots they bought in.
    requireOwnership(user, lot.createdById, ['Admin']);
    if (lot.sourceType !== 'External') {
      requireRole(user, ['Processor', 'Admin']);
    }

    // A lot a Hull & Grade made holds that hull's parchment kg: deleting it
    // would lose them, and the hull could no longer be voided (its lots are
    // gone). Voiding the Hull & Grade removes the lots it made and puts the
    // parchment back in one transaction (D7), so that is the way, for Admin
    // too. Lots hulled before prisma/sql/005 have no link: an Internal lot
    // with a parchment lot came from a hull.
    if (
      lot.parchmentWithdrawalId ||
      (lot.sourceType === 'Internal' && lot.parchmentLotId)
    ) {
      const parchment = lot.parchmentLot?.displayId ?? 'its parchment lot';
      return NextResponse.json(
        {
          error:
            `This green bean lot was made by a Hull & Grade of parchment lot ${parchment}, so deleting it would lose those parchment kg. ` +
            "Void that Hull & Grade in the parchment lot's withdrawal history instead: it removes the green bean lots it made and puts the parchment back.",
          parchmentLotId: lot.parchmentLotId,
        },
        { status: 409 },
      );
    }

    // Withdrawals (sales included) would cascade away with the lot, and
    // roaster stock holding kg, roasts, sale and invoice lines and cupping
    // samples would lose it, so a lot anything depends on is not deleted,
    // for Admin too: the counts come back instead (lib/greenLotRemoval).
    const dependents = greenLotDependents(lot._count);
    if (hasDependents(dependents)) {
      return NextResponse.json(
        {
          error: `This green bean lot already has ${describeDependents(dependents)}, so it was not deleted`,
          dependents,
        },
        { status: 409 },
      );
    }

    // CuppingScore and PricingHistory cascade on delete in the schema; empty
    // roaster stock rows are removed first, in the same transaction. The lot
    // is locked first, as a withdrawal and a claim take it, and the delete
    // repeats the "nothing depends on it" rule, so a withdrawal or claim that
    // landed after the check above makes it match nothing and rolls back.
    let deletedCount = 0;
    try {
      deletedCount = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "GreenBeanLot" WHERE "id" = ${id} FOR UPDATE`;
        const count = await deleteUnusedGreenLots(tx, [id]);
        if (count === 0) throw new Error(GREEN_LOT_IN_USE);
        return count;
      });
    } catch (error) {
      if ((error as Error)?.message !== GREEN_LOT_IN_USE) throw error;
    }
    if (deletedCount === 0) {
      const stillThere = await prisma.greenBeanLot.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!stillThere) {
        return NextResponse.json(
          { error: "Green bean lot not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error:
            "This green bean lot was drawn from since you looked, so it was not deleted. Reload and try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message: "Green bean lot deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
