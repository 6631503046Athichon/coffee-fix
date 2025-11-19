import { HarvestLot } from '../types';
import { api } from './api';
import {
  transformHarvestLotFromBackend,
  transformHarvestLotToBackend,
} from './utils/transformers';

/**
 * Fetch all harvest lots, optionally filtered by farm ID or status
 */
export const getAllHarvestLots = async (
  farmId?: string,
  status?: string
): Promise<HarvestLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (farmId) params.farmId = farmId;
    if (status) params.status = status;
    
    const response = await api.get<{ harvestLots: any[] }>(
      '/harvest-lots',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.harvestLots.map(transformHarvestLotFromBackend);
  } catch (error) {
    console.error('Failed to fetch harvest lots:', error);
    return [];
  }
};

/**
 * Fetch a single harvest lot by ID
 */
export const getHarvestLotById = async (lotId: string): Promise<HarvestLot | null> => {
  try {
    const response = await api.get<{ harvestLot: any }>(`/harvest-lots/${lotId}`);
    return transformHarvestLotFromBackend(response.harvestLot);
  } catch (error) {
    console.error('Failed to fetch harvest lot:', error);
    return null;
  }
};

/**
 * Create a new harvest lot
 */
export const addHarvestLot = async (lotData: Partial<HarvestLot>): Promise<HarvestLot> => {
  const response = await api.post<{ harvestLot: any; message: string }>(
    '/harvest-lots',
    transformHarvestLotToBackend(lotData)
  );
  return transformHarvestLotFromBackend(response.harvestLot);
};

/**
 * Update an existing harvest lot
 */
export const updateHarvestLot = async (
  lotId: string,
  lotData: Partial<HarvestLot>
): Promise<HarvestLot> => {
  const response = await api.put<{ harvestLot: any }>(
    `/harvest-lots/${lotId}`,
    transformHarvestLotToBackend(lotData)
  );
  return transformHarvestLotFromBackend(response.harvestLot);
};

/**
 * Delete a harvest lot
 */
export const deleteHarvestLot = async (lotId: string): Promise<void> => {
  await api.delete(`/harvest-lots/${lotId}`);
};

