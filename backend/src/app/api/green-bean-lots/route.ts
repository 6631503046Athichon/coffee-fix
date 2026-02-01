<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import { validateBody, createGreenBeanLotSchema } from '@/lib/validations'
=======
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, handleApiError } from "@/lib/middleware";
>>>>>>> feature/fix-processor

// GET /api/green-bean-lots - List all green bean lots
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const where: any = {};

<<<<<<< HEAD
    const where: Record<string, unknown> = {}

=======
>>>>>>> feature/fix-processor
    // Filter by sourceType if provided
    const sourceType = request.nextUrl.searchParams.get("sourceType");
    if (sourceType) {
      where.sourceType = sourceType;
    }

    // Filter by availabilityStatus if provided
    const availabilityStatus =
      request.nextUrl.searchParams.get("availabilityStatus");
    if (availabilityStatus) {
      where.availabilityStatus = availabilityStatus;
    }

    // Filter by parchmentLotId if provided
    const parchmentLotId = request.nextUrl.searchParams.get("parchmentLotId");
    if (parchmentLotId) {
      where.parchmentLotId = parchmentLotId;
    }

    const greenBeanLots = await prisma.greenBeanLot.findMany({
      where,
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
        cuppingScores: {
          include: {
            greenBeanLot: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ greenBeanLots });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/green-bean-lots - Create new green bean lot
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

<<<<<<< HEAD
    // Validate request body with Zod
    const validation = await validateBody(request, createGreenBeanLotSchema)
    if (!validation.success) {
      return validation.error
    }

    const { sourceType, parchmentLotId, grade, initialWeightKg, currentWeightKg, externalSource, availabilityStatus } = validation.data
=======
    const body = await request.json();
    const {
      sourceType,
      parchmentLotId,
      grade,
      initialWeightKg,
      currentWeightKg,
      externalSource,
      availabilityStatus,
      processorScore,
      pricePerKg,
      currency,
    } = body;

    // Validation
    if (!sourceType || !grade || !initialWeightKg) {
      return NextResponse.json(
        { error: "Source type, grade, and initial weight are required" },
        { status: 400 },
      );
    }

    // If internal source, parchmentLotId is required
    if (sourceType === "Internal" && !parchmentLotId) {
      return NextResponse.json(
        { error: "Parchment lot ID is required for internal sources" },
        { status: 400 },
      );
    }

    // If external source, externalSource object is required
    if (sourceType === "External" && !externalSource) {
      return NextResponse.json(
        { error: "External source details are required for external sources" },
        { status: 400 },
      );
    }
>>>>>>> feature/fix-processor

    const greenBeanLot = await prisma.greenBeanLot.create({
      data: {
        sourceType,
        parchmentLotId: parchmentLotId || null,
        grade,
<<<<<<< HEAD
        initialWeightKg,
        currentWeightKg: currentWeightKg || initialWeightKg,
        availabilityStatus: availabilityStatus || 'Available',
        externalSource: externalSource || undefined,
=======
        initialWeightKg: parseFloat(initialWeightKg),
        currentWeightKg: currentWeightKg
          ? parseFloat(currentWeightKg)
          : parseFloat(initialWeightKg),
        availabilityStatus: availabilityStatus || "Available",
        externalSource: externalSource
          ? JSON.stringify(externalSource)
          : undefined,
        processorScore: processorScore ? parseFloat(processorScore) : null,
        pricePerKg: pricePerKg ? parseFloat(pricePerKg) : null,
        currency: currency || null,
>>>>>>> feature/fix-processor
      },
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
      },
    });

    return NextResponse.json(
      { greenBeanLot, message: "Green bean lot created successfully" },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
