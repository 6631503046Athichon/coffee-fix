import { NextRequest, NextResponse } from "next/server";
import { Prisma, ProcessingBatchStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, handleApiError } from "@/lib/middleware";
import { nextDisplayId, nextDisplayIds, parseDateOnly, safeParseFloat, withDisplayIdRetry } from "@/lib/utils";
import { rateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { chainScope } from "@/lib/farmAccess";
import { checkGradedLots, createGradedLots, type GradedLot } from "@/lib/hullAndGrade";

// Thrown inside the create transaction when the status-conditional claim on
// the harvest lot updates zero rows (lot already Complete). Mapped to 409.
const HARVEST_LOT_ALREADY_PROCESSED = "HARVEST_LOT_ALREADY_PROCESSED";

// GET /api/processing-batches - List all processing batches
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const where: Prisma.ProcessingBatchWhereInput = {};

    // Filter by harvestLotId if provided
    const harvestLotId = request.nextUrl.searchParams.get("harvestLotId");
    if (harvestLotId) {
      where.harvestLotId = harvestLotId;
    }

    // Filter by status if provided (validated against enum)
    const status = request.nextUrl.searchParams.get("status");
    if (status && (Object.values(ProcessingBatchStatus) as string[]).includes(status)) {
      where.status = status as ProcessingBatchStatus;
    }

    // Each their own (lib/farmAccess chainScope): a processor's own batches,
    // a farmer's on their own and shared farms' cherry, none for a roaster;
    // the union for several roles. Admins see every batch.
    const scope = await chainScope(user);
    if (scope) {
      where.AND = [scope.processingBatchWhere];
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50", 10), 200);

    const processingBatches = await prisma.processingBatch.findMany({
      where,
      take: limit,
      include: {
        harvestLot: {
          select: {
            id: true,
            farmerName: true,
            cherryVariety: true,
            weightKg: true,
          },
        },
        cropYear: {
          select: {
            id: true,
            year: true,
          },
        },
        // Every reading, oldest first, as bulk-load sends them.
        dryingLogs: {
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        },
        parchmentLots: {
          select: {
            id: true,
            status: true,
            initialWeightKg: true,
            currentWeightKg: true,
            moistureContent: true,
            processType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ processingBatches });
  } catch (error) {
    return handleApiError(error);
  }
}

// The purpose on the Hull & Grade row a one-step Process & Grade records, as
// the two-step flow sends it.
const HULL_AND_GRADE_PURPOSE = "Hull and grade";

// POST /api/processing-batches - Create new processing batch
//
// With `hullAndGrade: { gradedLots, totalGreenBeanWeight? }` on a Completed
// batch it is the Parchment page's one-step Process & Grade: the batch, its
// parchment lot and a Hull & Grade of the whole parchment into one green bean
// lot per grade are written in ONE transaction, so a grading that fails
// leaves nothing behind (the cherry lot stays Ready). The grading follows the
// same rules as POST /api/parchment-lots/:id/withdrawals (lib/hullAndGrade),
// which the workbench's two-step flow keeps using.
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    requireRole(user, ["Processor", "Admin"]);
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    });
    if (limited) return limited;

    const body = await request.json();
    const {
      harvestLotId,
      status,
      processType,
      processNotes,
      cropYearId,
      parchmentWeightKg,
      moistureContent,
      dryingStartDate,
      dryingEndDate,
      baggingDate,
      hullAndGrade,
    } = body;

    // Validation
    if (!harvestLotId || !processType) {
      return NextResponse.json(
        { error: "Harvest lot ID and process type are required" },
        { status: 400 },
      );
    }

    const harvestLot = await prisma.harvestLot.findUnique({
      where: { id: harvestLotId },
      select: {
        id: true,
        weightKg: true,
        status: true,
        _count: { select: { processingBatches: true } },
      },
    });

    if (!harvestLot) {
      return NextResponse.json(
        { error: "Harvest lot not found" },
        { status: 404 },
      );
    }

    // Whole-lot semantics: a harvest lot feeds exactly one processing batch,
    // so a lot that is already Complete cannot be processed again. This
    // pre-check gives a clean 409 on the common path; the authoritative,
    // race-safe guard is the status-conditional updateMany in the transaction.
    if (harvestLot.status !== "ReadyForProcessing" || harvestLot._count.processingBatches > 0) {
      return NextResponse.json(
        { error: "Harvest lot has already been processed" },
        { status: 409 },
      );
    }

    const isCompletedBatch = status === "Completed";
    const parsedParchmentWeight = safeParseFloat(parchmentWeightKg);
    const parsedMoistureContent = safeParseFloat(moistureContent);

    // Process & Grade: only a Completed batch has parchment to hull.
    const wantsHull = hullAndGrade !== undefined && hullAndGrade !== null;
    if (wantsHull) {
      if (typeof hullAndGrade !== "object" || Array.isArray(hullAndGrade)) {
        return NextResponse.json(
          { error: "Hull & Grade must be an object with the graded lots" },
          { status: 400 },
        );
      }
      if (!isCompletedBatch) {
        return NextResponse.json(
          { error: "Hull & Grade needs a Completed batch with its parchment weight" },
          { status: 400 },
        );
      }
    }

    if (isCompletedBatch) {
      if (parsedParchmentWeight === null || parsedParchmentWeight <= 0) {
        return NextResponse.json(
          { error: "Valid parchment weight is required for completed batches" },
          { status: 400 },
        );
      }

      if (
        parsedMoistureContent === null ||
        parsedMoistureContent < 0 ||
        parsedMoistureContent > 100
      ) {
        return NextResponse.json(
          { error: "Valid moisture content (0-100) is required for completed batches" },
          { status: 400 },
        );
      }

      // Drying dates are optional. The processor can record a completed
      // batch without exact drying dates and back-fill them later via
      // the batch edit flow. We only validate them when supplied:
      // - if either side is set, parse it and reject Invalid Date strings;
      // - if both are set, enforce end >= start.
      const parsedDryingStartDate = dryingStartDate
        ? parseDateOnly(dryingStartDate)
        : null;
      const parsedDryingEndDate = dryingEndDate
        ? parseDateOnly(dryingEndDate)
        : null;
      if (
        parsedDryingStartDate &&
        Number.isNaN(parsedDryingStartDate.getTime())
      ) {
        return NextResponse.json(
          { error: "Drying start date is not a valid date" },
          { status: 400 },
        );
      }
      if (
        parsedDryingEndDate &&
        Number.isNaN(parsedDryingEndDate.getTime())
      ) {
        return NextResponse.json(
          { error: "Drying end date is not a valid date" },
          { status: 400 },
        );
      }
      if (
        parsedDryingStartDate &&
        parsedDryingEndDate &&
        parsedDryingEndDate < parsedDryingStartDate
      ) {
        return NextResponse.json(
          { error: "Drying end date cannot be before drying start date" },
          { status: 400 },
        );
      }

      // Parchment is the measured output of the entire cherry lot.
      const cherryWeight = harvestLot.weightKg;
      if (parsedParchmentWeight > cherryWeight) {
        return NextResponse.json(
          {
            error: `Parchment weight (${parsedParchmentWeight.toFixed(2)} kg) cannot exceed the cherry lot weight (${cherryWeight.toFixed(2)} kg).`,
          },
          { status: 400 },
        );
      }
    }

    // The whole parchment is hulled, so the grades may weigh up to it. Checked
    // before anything is written, with the Hull & Grade withdrawal's rules.
    let gradedLots: GradedLot[] = [];
    if (wantsHull && parsedParchmentWeight !== null) {
      const graded = checkGradedLots(
        hullAndGrade.gradedLots,
        hullAndGrade.totalGreenBeanWeight,
        parsedParchmentWeight,
      );
      if (!graded.ok) {
        return NextResponse.json({ error: graded.error }, { status: 400 });
      }
      gradedLots = graded.lots;
    }
    const hulling = gradedLots.length > 0;

    // Wrap displayId allocation + the whole transaction in a retry helper.
    // Every id comes from the DocumentSequence counter (lib/documentSequence),
    // so concurrent callers never share one; if any collides with a row
    // written without the counter, the entire transaction rolls back and we
    // take fresh PB, PCH (and GBL) numbers.
    let created;
    try {
      created = await withDisplayIdRetry(async () => {
        const batchDisplayId = await nextDisplayId(prisma.processingBatch, "PB");
        const parchmentDisplayId =
          isCompletedBatch
            ? await nextDisplayId(prisma.parchmentLot, "PCH")
            : null;
        const greenBeanDisplayIds = hulling
          ? await nextDisplayIds(prisma.greenBeanLot, "GBL", gradedLots.length)
          : [];

        // Use transaction to claim the harvest lot and create the batch atomically
        return prisma.$transaction(async (tx) => {
          // Claim the source once, including legacy lots whose status is stale.
          // Competing requests serialize on this row; only one can claim it.
          const claimed = await tx.harvestLot.updateMany({
            where: {
              id: harvestLotId,
              status: "ReadyForProcessing",
              processingBatches: { none: {} },
            },
            data: { status: "Complete", remainingWeightKg: 0 },
          });
          if (claimed.count === 0) {
            throw new Error(HARVEST_LOT_ALREADY_PROCESSED);
          }

          // Create processing batch
          const batch = await tx.processingBatch.create({
            data: {
              displayId: batchDisplayId,
              harvestLotId,
              status: status || "ToProcess",
              processType,
              processNotes: processNotes || null,
              cropYearId: cropYearId || null,
              createdById: user.id,
              parchmentWeightKg: parsedParchmentWeight,
              moistureContent: parsedMoistureContent,
              dryingStartDate: parseDateOnly(dryingStartDate),
              dryingEndDate: parseDateOnly(dryingEndDate),
              baggingDate: parseDateOnly(baggingDate),
            },
            include: {
              harvestLot: {
                select: {
                  id: true,
                  farmerName: true,
                  cherryVariety: true,
                  weightKg: true,
                },
              },
              cropYear: {
                select: {
                  id: true,
                  year: true,
                },
              },
              dryingLogs: {
                orderBy: { date: "asc" },
              },
              parchmentLots: true,
            },
          });

          // If status is Completed and we have parchment data, create parchment lot
          if (
            isCompletedBatch &&
            parsedParchmentWeight !== null &&
            parsedMoistureContent !== null
          ) {
            const parchmentLot = await tx.parchmentLot.create({
              data: {
                displayId: parchmentDisplayId,
                processingBatchId: batch.id,
                harvestLotId: harvestLotId,
                initialWeightKg: parsedParchmentWeight,
                // Hulled whole in this same transaction: nothing is left of it
                // to sit in Awaiting Hulling, as after a two-step full hull.
                currentWeightKg: hulling ? 0 : parsedParchmentWeight,
                moistureContent: parsedMoistureContent,
                processType: processType,
                status: hulling ? "Hulled" : "AwaitingHulling",
              },
            });

            if (hulling) {
              // The same Hull & Grade row the parchment withdrawal route
              // records, so the hull shows, voids and corrects like any other.
              const withdrawal = await tx.parchmentWithdrawal.create({
                data: {
                  parchmentLotId: parchmentLot.id,
                  amountKg: parsedParchmentWeight,
                  withdrawalType: "HullAndGrade",
                  purpose: HULL_AND_GRADE_PURPOSE,
                  withdrawnBy: user.id,
                  withdrawnByName: user.name,
                },
              });
              // The batch is the caller's, so its green beans are too.
              const greenBeanLots = await createGradedLots(tx, {
                parchmentLotId: parchmentLot.id,
                parchmentWithdrawalId: withdrawal.id,
                ownerId: user.id,
                pricedById: user.id,
                lots: gradedLots,
                displayIds: greenBeanDisplayIds,
              });
              const hulledParchment = await tx.parchmentLot.findUnique({
                where: { id: parchmentLot.id },
                include: { withdrawalHistory: { orderBy: { date: "desc" } } },
              });
              return { batch, parchmentLot: hulledParchment, greenBeanLots };
            }
          }

          return { batch, parchmentLot: null, greenBeanLots: null };
        });
      });
    } catch (error) {
      // withDisplayIdRetry rethrows anything that is not a displayId P2002, so
      // the claim sentinel reaches us on the first attempt. Map it here rather
      // than via handleApiError so ordinary contention is not logged as an
      // API error.
      if ((error as Error)?.message === HARVEST_LOT_ALREADY_PROCESSED) {
        return NextResponse.json(
          { error: "Harvest lot has already been processed" },
          { status: 409 },
        );
      }
      throw error;
    }

    if (created.greenBeanLots) {
      return NextResponse.json(
        {
          processingBatch: created.batch,
          // As POST /api/parchment-lots/:id/withdrawals answers a Hull &
          // Grade: the hulled lot and the new lots, prices included.
          parchmentLot: created.parchmentLot,
          greenBeanLots: created.greenBeanLots,
          message: "Processing batch created and graded successfully",
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { processingBatch: created.batch, message: "Processing batch created successfully" },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
