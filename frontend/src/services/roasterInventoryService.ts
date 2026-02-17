import { RoasterInventoryItem } from '../types';
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
