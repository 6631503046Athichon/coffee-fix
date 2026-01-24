import { HarvestLot } from '../types';
import { api } from './api';
import {
  transformHarvestLotFromBackend,
  transformHarvestLotToBackend,
} from './utils/transformers';
import { handleApiError, handleApiErrorWithFallback } from '../utils/errorHandler';

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
    return handleApiErrorWithFallback<HarvestLot[]>(error, {
      operation: 'fetch harvest lots',
      fallbackValue: [],
    });
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
    return handleApiErrorWithFallback<HarvestLot | null>(error, {
      operation: 'fetch harvest lot',
      fallbackValue: null,
    });
  }
};

/**
 * Create a new harvest lot
 */
export const addHarvestLot = async (lotData: Partial<HarvestLot>): Promise<HarvestLot> => {
  try {
    const response = await api.post<{ harvestLot: any; message: string }>(
      '/harvest-lots',
      transformHarvestLotToBackend(lotData)
    );
    return transformHarvestLotFromBackend(response.harvestLot);
  } catch (error) {
    throw new Error(handleApiError(error, 'create harvest lot'));
  }
};

/**
 * Update an existing harvest lot
 */
export const updateHarvestLot = async (
  lotId: string,
  lotData: Partial<HarvestLot>
): Promise<HarvestLot> => {
  try {
    const response = await api.put<{ harvestLot: any }>(
      `/harvest-lots/${lotId}`,
      transformHarvestLotToBackend(lotData)
    );
    return transformHarvestLotFromBackend(response.harvestLot);
  } catch (error) {
    throw new Error(handleApiError(error, 'update harvest lot'));
  }
};

/**
 * Delete a harvest lot
 */
export const deleteHarvestLot = async (lotId: string): Promise<void> => {
  try {
    await api.delete(`/harvest-lots/${lotId}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete harvest lot'));
  }
};

