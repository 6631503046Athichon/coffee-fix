import { NextRequest, NextResponse } from "next/server";
import { Prisma, ProcessingBatchStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, handleApiError } from "@/lib/middleware";
import { nextDisplayId, parseDateOnly, safeParseFloat, withDisplayIdRetry } from "@/lib/utils";
import { rateLimit, RATE_LIMITS } from "@/lib/rateLimit";

// GET /api/processing-batches - List all processing batches
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

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
        dryingLogs: {
          orderBy: { date: "desc" },
          take: 10,
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

// POST /api/processing-batches - Create new processing batch
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
        remainingWeightKg: true,
      },
    });

    if (!harvestLot) {
      return NextResponse.json(
        { error: "Harvest lot not found" },
        { status: 404 },
      );
    }

    const isCompletedBatch = status === "Completed";
    const parsedParchmentWeight = safeParseFloat(parchmentWeightKg);
    const parsedMoistureContent = safeParseFloat(moistureContent);

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

      const availableWeight =
        harvestLot.remainingWeightKg ?? harvestLot.weightKg;
      if (parsedParchmentWeight > availableWeight) {
        return NextResponse.json(
          {
            error: `Parchment weight (${parsedParchmentWeight} kg) exceeds available harvest lot weight (${availableWeight.toFixed(2)} kg)`,
          },
          { status: 400 },
        );
      }
    }

    // Wrap displayId allocation + the whole transaction in a retry helper.
    // If a concurrent caller wins the race on either PB or PCH ids, the entire
    // transaction rolls back and we re-read max for both prefixes.
    const processingBatch = await withDisplayIdRetry(async () => {
      const batchDisplayId = await nextDisplayId(prisma.processingBatch, "PB");
      const parchmentDisplayId =
        isCompletedBatch
          ? await nextDisplayId(prisma.parchmentLot, "PCH")
          : null;

      // Use transaction to create batch and update harvest lot status atomically
      return prisma.$transaction(async (tx) => {
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
        await tx.parchmentLot.create({
          data: {
            displayId: parchmentDisplayId,
            processingBatchId: batch.id,
            harvestLotId: harvestLotId,
            initialWeightKg: parsedParchmentWeight,
            currentWeightKg: parsedParchmentWeight,
            moistureContent: parsedMoistureContent,
            processType: processType,
            status: "AwaitingHulling",
          },
        });

        // Atomic decrement on the harvest lot's remainingWeightKg with a
        // where guard. Two concurrent processing batches against the same
        // harvest lot would otherwise both pass the up-front check and
        // overdraw the lot. updateMany compiles to one SQL UPDATE and
        // Postgres serialises row writes, so the loser sees count === 0.
        //
        // First-time path: legacy harvest lots may have remainingWeightKg
        // null (only weightKg set on creation). Initialise it to weightKg
        // before the decrement, conditional on still being null so we
        // don't clobber an already-decremented value from another tx.
        await tx.harvestLot.updateMany({
          where: { id: harvestLotId, remainingWeightKg: null },
          data: { remainingWeightKg: harvestLot.weightKg },
        });
        const guarded = await tx.harvestLot.updateMany({
          where: {
            id: harvestLotId,
            remainingWeightKg: { gte: parsedParchmentWeight },
          },
          data: { remainingWeightKg: { decrement: parsedParchmentWeight } },
        });
        if (guarded.count === 0) {
          throw new Error(
            "Insufficient harvest lot weight (concurrent batch contention)",
          );
        }

        // Re-read post-decrement to set status. Clamp float residue.
        const freshHarvest = await tx.harvestLot.findUnique({
          where: { id: harvestLotId },
          select: { remainingWeightKg: true },
        });
        const rawRemaining = freshHarvest?.remainingWeightKg ?? 0;
        const finalRemaining =
          rawRemaining < 0 ? 0 : parseFloat(rawRemaining.toFixed(6));
        const nextHarvestStatus =
          finalRemaining > 0 ? "ReadyForProcessing" : "Complete";

        await tx.harvestLot.update({
          where: { id: harvestLotId },
          data: {
            remainingWeightKg: finalRemaining,
            status: nextHarvestStatus,
          },
        });
      }

        return batch;
      });
    });

    return NextResponse.json(
      { processingBatch, message: "Processing batch created successfully" },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
