import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, handleApiError } from "@/lib/middleware";
import { safeParseFloat } from "@/lib/utils";

// GET /api/green-bean-lots/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
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
        roastBatches: {
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

    return NextResponse.json({ greenBeanLot });
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

    const body = await request.json();
    const { processorScore } = body;

    if (processorScore === undefined) {
      return NextResponse.json(
        { error: "processorScore is required" },
        { status: 400 },
      );
    }

    const score = safeParseFloat(processorScore);
    if (score === null) {
      return NextResponse.json(
        { error: "Invalid processorScore value" },
        { status: 400 },
      );
    }

    const updatedLot = await prisma.greenBeanLot.update({
      where: { id },
      data: { processorScore: score },
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

    const body = await request.json();
    const {
      grade,
      currentWeightKg,
      availabilityStatus,
      pricePerKg,
      currency,
      priceSetDate,
    } = body;

    const updateData: any = {};
    if (grade !== undefined) updateData.grade = grade;
    if (currentWeightKg !== undefined) {
      const weight = safeParseFloat(currentWeightKg);
      if (weight !== null) updateData.currentWeightKg = weight;
    }
    if (availabilityStatus !== undefined)
      updateData.availabilityStatus = availabilityStatus;
    if (pricePerKg !== undefined) {
      updateData.pricePerKg = safeParseFloat(pricePerKg);
    }
    if (currency !== undefined) updateData.currency = currency;
    if (priceSetDate !== undefined) {
      updateData.priceSetDate = priceSetDate ? new Date(priceSetDate) : null;
      updateData.priceSetBy = user.id;
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

    // Create pricing history entry if price was set
    if (pricePerKg && currency) {
      const price = safeParseFloat(pricePerKg);
      if (price !== null) {
        await prisma.pricingHistory.create({
          data: {
            greenBeanLotId: id,
            pricePerKg: price,
            currency,
            effectiveDate: priceSetDate ? new Date(priceSetDate) : new Date(),
            setBy: user.id,
          },
        });
      }
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
    // SECURITY: Only Processor and Admin can delete green bean lots
    requireRole(user, ['Processor', 'Admin']);
    const { id } = await params;

    // Check if lot exists
    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      include: {
        roasterInventory: true,
        roastBatches: true,
      },
    });

    if (!lot) {
      return NextResponse.json(
        { error: "Green bean lot not found" },
        { status: 404 },
      );
    }

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

    // Delete related data first
    await prisma.cuppingScore.deleteMany({
      where: { greenBeanLotId: id },
    });
    await prisma.greenBeanWithdrawal.deleteMany({
      where: { greenBeanLotId: id },
    });
    await prisma.pricingHistory.deleteMany({
      where: { greenBeanLotId: id },
    });

    // Delete the lot
    await prisma.greenBeanLot.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Green bean lot deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
