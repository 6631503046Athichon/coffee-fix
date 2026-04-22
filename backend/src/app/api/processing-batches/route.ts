import { NextRequest, NextResponse } from "next/server";
import { Prisma, ProcessingBatchStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, handleApiError } from "@/lib/middleware";
import { nextDisplayId, safeParseFloat } from "@/lib/utils";

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

      if (!dryingStartDate || !dryingEndDate) {
        return NextResponse.json(
          { error: "Drying start date and drying end date are required for completed batches" },
          { status: 400 },
        );
      }

      const parsedDryingStartDate = new Date(dryingStartDate);
      const parsedDryingEndDate = new Date(dryingEndDate);
      if (
        Number.isNaN(parsedDryingStartDate.getTime()) ||
        Number.isNaN(parsedDryingEndDate.getTime())
      ) {
        return NextResponse.json(
          { error: "Drying dates must be valid dates" },
          { status: 400 },
        );
      }

      if (parsedDryingEndDate < parsedDryingStartDate) {
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

    // Pre-generate display IDs outside the transaction
    const batchDisplayId = await nextDisplayId(prisma.processingBatch, "PB");
    const parchmentDisplayId =
      isCompletedBatch
        ? await nextDisplayId(prisma.parchmentLot, "PCH")
        : null;

    // Use transaction to create batch and update harvest lot status atomically
    const processingBatch = await prisma.$transaction(async (tx) => {
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
          dryingStartDate: dryingStartDate ? new Date(dryingStartDate) : null,
          dryingEndDate: dryingEndDate ? new Date(dryingEndDate) : null,
          baggingDate: baggingDate ? new Date(baggingDate) : null,
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

        const availableWeight =
          harvestLot.remainingWeightKg ?? harvestLot.weightKg;
        const newRemainingWeight = Math.max(
          0,
          parseFloat((availableWeight - parsedParchmentWeight).toFixed(6)),
        );
        const nextHarvestStatus =
          newRemainingWeight > 0 ? "ReadyForProcessing" : "Complete";

        await tx.harvestLot.update({
          where: { id: harvestLotId },
          data: {
            remainingWeightKg: newRemainingWeight,
            status: nextHarvestStatus,
          },
        });
      }

      return batch;
    });

    return NextResponse.json(
      { processingBatch, message: "Processing batch created successfully" },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
