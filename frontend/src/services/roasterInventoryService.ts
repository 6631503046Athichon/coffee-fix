import { RoasterInventoryItem, RoastBatch } from '../types';
import { api } from './api';

export const getAllRoasterInventory = async (): Promise<RoasterInventoryItem[]> => {
  try {
    const response = await api.get<{ inventoryItems: any[] }>('/roaster-inventory');
    console.log('[RoasterInventoryService] Fetched inventory items:', response.inventoryItems);
    return response.inventoryItems || [];
  } catch (error) {
    console.error('[RoasterInventoryService] Failed to fetch roaster inventory:', error);
    throw error;
  }
};

export const claimInventory = async (greenBeanLotId: string, claimedWeightKg: number): Promise<RoasterInventoryItem> => {
  try {
    const response = await api.post<{ inventoryItem: any; message: string }>('/roaster-inventory', {
      greenBeanLotId,
      claimedWeightKg,
    });
    console.log('[RoasterInventoryService] Claimed inventory:', response.inventoryItem);
    return response.inventoryItem;
  } catch (error) {
    console.error('[RoasterInventoryService] Failed to claim inventory:', error);
    throw error;
  }
};

// ============================================
// Roast Batches
// ============================================

export const getAllRoastBatches = async (): Promise<RoastBatch[]> => {
  try {
    const response = await api.get<{ roastBatches: any[] }>('/roast-batches');
    console.log('[RoasterInventoryService] Fetched roast batches:', response.roastBatches);
    return response.roastBatches || [];
  } catch (error) {
    console.error('[RoasterInventoryService] Failed to fetch roast batches:', error);
    throw error;
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

export const createRoastBatch = async (input: CreateRoastBatchInput): Promise<{ roastBatch: RoastBatch; updatedInventory?: RoasterInventoryItem }> => {
  try {
    const response = await api.post<{ roastBatch: any; message: string }>('/roast-batches', input);
    console.log('[RoasterInventoryService] Created roast batch:', response.roastBatch);

    // The backend also returns updated inventory in the response
    const roastBatch: RoastBatch = {
      id: response.roastBatch.id,
      roasterId: response.roastBatch.roasterId,
      roasterInventoryId: response.roastBatch.roasterInventoryId,
      greenBeanLotId: response.roastBatch.greenBeanLotId,
      roastDate: response.roastBatch.roastDate
        ? new Date(response.roastBatch.roastDate).toISOString().substring(0, 10)
        : new Date().toISOString().substring(0, 10),
      batchSizeKg: response.roastBatch.batchSizeKg,
      yieldPercentage: response.roastBatch.yieldPercentage,
      roastedWeightKg: response.roastBatch.roastedWeightKg,
      weightLossPct: response.roastBatch.weightLossPct,
      roastLevel: response.roastBatch.roastLevel,
      roastProfileNotes: response.roastBatch.roastProfileNotes,
      flavorNotes: response.roastBatch.flavorNotes,
    };

    // Get updated inventory from the included relation
    let updatedInventory: RoasterInventoryItem | undefined;
    if (response.roastBatch.roasterInventory) {
      updatedInventory = response.roastBatch.roasterInventory;
    }

    return { roastBatch, updatedInventory };
  } catch (error) {
    console.error('[RoasterInventoryService] Failed to create roast batch:', error);
    throw error;
  }
};
