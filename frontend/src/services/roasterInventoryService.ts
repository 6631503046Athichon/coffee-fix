import { RoasterInventoryItem } from '../types';
import { api } from './api';

export const getAllRoasterInventory = async (): Promise<RoasterInventoryItem[]> => {
  try {
    const response = await api.get('/roaster-inventory');
    console.log('[RoasterInventoryService] Fetched inventory items:', response.data.inventoryItems);
    return response.data.inventoryItems || [];
  } catch (error) {
    console.error('[RoasterInventoryService] Failed to fetch roaster inventory:', error);
    throw error;
  }
};
