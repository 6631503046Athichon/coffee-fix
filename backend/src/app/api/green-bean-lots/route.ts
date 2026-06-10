import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, handleApiError } from "@/lib/middleware";
import { validateBody, createGreenBeanLotSchema } from "@/lib/validations";
import { nextDisplayId, withDisplayIdRetry } from "@/lib/utils";
import { rateLimit, RATE_LIMITS } from "@/lib/rateLimit";

// GET /api/green-bean-lots - List all green bean lots
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const where: Record<string, unknown> = {};

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

    // Pagination
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [greenBeanLots, total] = await Promise.all([
      prisma.greenBeanLot.findMany({
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
          _count: {
            select: { cuppingScores: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.greenBeanLot.count({ where }),
    ]);

    return NextResponse.json({ greenBeanLots, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/green-bean-lots - Create new green bean lot
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    // SECURITY: Only Processor and Admin can create green bean lots
    requireRole(user, ["Processor", "Admin"]);
    const limited = await rateLimit(request, {
      ...RATE_LIMITS.WRITE_LOT,
      keyFn: () => `user:${user.id}`,
    });
    if (limited) return limited;

    // Validate request body with Zod
    const validation = await validateBody(request, createGreenBeanLotSchema);
    if (!validation.success) {
      return validation.error;
    }

    // createGreenBeanLotSchema doesn't declare `processorScore`, but the route
    // historically accepts it from clients that send a pre-cupping processor
    // score. Treat it as an unknown extra field we'll coerce below.
    const {
      sourceType,
      parchmentLotId,
      grade,
      initialWeightKg,
      currentWeightKg,
      externalSource,
      availabilityStatus,
      pricePerKg,
      currency,
    } = validation.data;
    const processorScore = (validation.data as { processorScore?: unknown }).processorScore;

    const greenBeanLot = await withDisplayIdRetry(async () => {
      const displayId = await nextDisplayId(prisma.greenBeanLot, "GBL")
      return prisma.greenBeanLot.create({
        data: {
          displayId,
          sourceType,
          parchmentLotId: parchmentLotId || null,
          grade,
          initialWeightKg,
          currentWeightKg: currentWeightKg || initialWeightKg,
          availabilityStatus: availabilityStatus || "Available",
          externalSource: externalSource || undefined,
          processorScore: processorScore ? parseFloat(String(processorScore)) : null,
          pricePerKg: pricePerKg ? parseFloat(String(pricePerKg)) : null,
          currency: currency || null,
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
    });

    return NextResponse.json(
      { greenBeanLot, message: "Green bean lot created successfully" },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
