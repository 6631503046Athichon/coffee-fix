import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, handleApiError } from "@/lib/middleware";
import { reserveSequence } from "@/lib/documentSequence";

export const dynamic = "force-dynamic";

// Model configuration: name, prefix, and prisma delegate accessor
const MODEL_CONFIGS = [
  { name: "HarvestLot", prefix: "HL", delegate: () => prisma.harvestLot },
  { name: "ProcessingBatch", prefix: "PB", delegate: () => prisma.processingBatch },
  { name: "ParchmentLot", prefix: "PCH", delegate: () => prisma.parchmentLot },
  { name: "GreenBeanLot", prefix: "GBL", delegate: () => prisma.greenBeanLot },
] as const;

type ModelName = (typeof MODEL_CONFIGS)[number]["name"];

interface ModelResult {
  updated: number;
  details: Record<string, number>;
}

/**
 * For a given model delegate and prefix, find the max existing sequential
 * number for a specific {PREFIX}-{YEAR}- pattern already in the database.
 */
async function getMaxNumForYearPrefix(
  delegate: { findMany: (args: any) => Promise<any[]> },
  prefix: string,
  year: number
): Promise<number> {
  const yearPrefix = `${prefix}-${year}-`;

  const items = await delegate.findMany({
    where: {
      displayId: { startsWith: yearPrefix },
    },
    select: { displayId: true },
  });

  let maxNum = 0;
  for (const item of items) {
    const numStr = (item.displayId as string).replace(yearPrefix, "");
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }

  return maxNum;
}

/**
 * Backfill displayIds for a single model.
 * Returns the count of updated records and a per-year breakdown.
 */
async function backfillModel(
  delegate: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  },
  prefix: string,
  dryRun: boolean
): Promise<ModelResult> {
  // Fetch all records with null displayId, ordered by createdAt ASC
  const nullRecords = await delegate.findMany({
    where: { displayId: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (nullRecords.length === 0) {
    return { updated: 0, details: {} };
  }

  // Group records by year extracted from their own createdAt
  const byYear = new Map<number, Array<{ id: string; createdAt: Date }>>();
  for (const record of nullRecords) {
    const year = new Date(record.createdAt).getFullYear();
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year)!.push(record);
  }

  // For each year, read the highest number in use (the counter's floor) and
  // give each record the next number from the DocumentSequence counter
  const details: Record<string, number> = {};
  let totalUpdated = 0;

  for (const [year, records] of byYear.entries()) {
    const maxNum = await getMaxNumForYearPrefix(delegate, prefix, year);
    const yearPrefix = `${prefix}-${year}-`;

    let yearUpdated = 0;

    for (const record of records) {
      if (dryRun) {
        yearUpdated++;
        continue;
      }

      // Each number comes from the DocumentSequence counter, never below the
      // year's highest number, so a deleted record's number is not handed out
      // again. A dry run takes none.
      // Attempt to write with retry loop on P2002 unique constraint collision
      let success = false;
      let retries = 0;
      const maxRetries = 3;
      let candidateId = "";

      while (!success && retries < maxRetries) {
        candidateId = `${yearPrefix}${await reserveSequence(`${prefix}-${year}`, maxNum)}`;
        try {
          await delegate.update({
            where: { id: record.id },
            data: { displayId: candidateId },
          });
          success = true;
          yearUpdated++;
        } catch (err: any) {
          if (err?.code === "P2002") {
            // Collision: the next attempt takes the next number
            retries++;
          } else {
            // Re-throw non-collision errors
            throw err;
          }
        }
      }

      if (!success) {
        console.error(
          `[backfill-display-ids] Failed to assign displayId for record ${record.id} after ${maxRetries} retries (last candidate: ${candidateId})`
        );
      }
    }

    if (yearUpdated > 0) {
      details[String(year)] = yearUpdated;
    }
    totalUpdated += yearUpdated;
  }

  return { updated: totalUpdated, details };
}

/**
 * POST /api/backfill-display-ids
 * Backfills displayId for all lot types where displayId is null.
 * Requires Admin role. Supports ?dryRun=true to preview without writing.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    requireRole(user, ["Admin"]);

    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

    const results: Record<ModelName, ModelResult> = {} as Record<
      ModelName,
      ModelResult
    >;

    for (const config of MODEL_CONFIGS) {
      const delegate = config.delegate() as any;
      results[config.name] = await backfillModel(delegate, config.prefix, dryRun);
    }

    return NextResponse.json({
      message: dryRun
        ? "Dry run complete — no records were modified"
        : "Backfill complete",
      dryRun,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
