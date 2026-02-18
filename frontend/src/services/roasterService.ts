import { RoasterInventoryItem, RoastBatch, RoastLevel } from "../types";
import { api } from "./api";
import { handleApiErrorWithFallback } from "../utils/errorHandler";

// ============================================
// Roaster Inventory
// ============================================

export function transformInventoryItem(item: any): RoasterInventoryItem {
  return {
    id: item.id,
    roasterId: item.roasterId,
    greenBeanLotId: item.greenBeanLotId,
    claimedWeightKg: item.claimedWeightKg,
    remainingWeightKg: item.remainingWeightKg,
  };
}

export function transformRoastBatch(batch: any): RoastBatch {
  return {
    id: batch.id,
    roasterId: batch.roasterId,
    roasterInventoryId: batch.roasterInventoryId,
    greenBeanLotId: batch.greenBeanLotId,
    roastDate: batch.roastDate
      ? new Date(batch.roastDate).toISOString().substring(0, 10)
      : new Date().toISOString().substring(0, 10),
    batchSizeKg: batch.batchSizeKg,
    yieldPercentage: batch.yieldPercentage,
    roastedWeightKg: batch.roastedWeightKg ?? undefined,
    weightLossPct: batch.weightLossPct ?? undefined,
    roastLevel: batch.roastLevel as RoastLevel | undefined,
    roastProfileNotes: batch.roastProfileNotes,
    flavorNotes: batch.flavorNotes ?? undefined,
  };
}

/**
 * Get all roaster inventory items (current user's own if Roaster role)
 */
export const getAllRoasterInventory = async (): Promise<RoasterInventoryItem[]> => {
  try {
    const response = await api.get<{ inventoryItems: any[] }>("/roaster-inventory");
    return response.inventoryItems.map(transformInventoryItem);
  } catch (error) {
    return handleApiErrorWithFallback<RoasterInventoryItem[]>(error, {
      operation: "fetch roaster inventory",
      fallbackValue: [],
    });
  }
};

/**
 * Claim a green bean lot into roaster inventory
 */
export const claimGreenBeanLot = async (
  greenBeanLotId: string,
  claimedWeightKg: number,
): Promise<RoasterInventoryItem> => {
  const response = await api.post<{ inventoryItem: any }>(
    "/roaster-inventory",
    { greenBeanLotId, claimedWeightKg },
  );
  return transformInventoryItem(response.inventoryItem);
};

// ============================================
// Roast Batches
// ============================================

/**
 * Get all roast batches (current user's own if Roaster role)
 */
export const getAllRoastBatches = async (): Promise<RoastBatch[]> => {
  try {
    const response = await api.get<{ roastBatches: any[] }>("/roast-batches");
    return response.roastBatches.map(transformRoastBatch);
  } catch (error) {
    return handleApiErrorWithFallback<RoastBatch[]>(error, {
      operation: "fetch roast batches",
      fallbackValue: [],
    });
  }
};

export interface CreateRoastBatchInput {
  roasterInventoryId: string;
  greenBeanLotId: string;
  batchSizeKg: number;
  yieldPercentage: number;
  roastedWeightKg?: number;
  weightLossPct?: number;
  roastLevel?: string;
  roastProfileNotes: string;
  flavorNotes?: string;
}

/**
 * Create a new roast batch (also updates inventory remainingWeightKg on backend)
 */
export const createRoastBatch = async (
  input: CreateRoastBatchInput,
): Promise<{
  roastBatch: RoastBatch;
  updatedInventory: { id: string; remainingWeightKg: number };
}> => {
  const response = await api.post<{
    roastBatch: any;
    message: string;
  }>("/roast-batches", input);

  const batch = transformRoastBatch(response.roastBatch);
  return {
    roastBatch: batch,
    updatedInventory: {
      id: response.roastBatch.roasterInventory?.id ?? input.roasterInventoryId,
      remainingWeightKg: response.roastBatch.roasterInventory?.remainingWeightKg ?? 0,
    },
  };
};
