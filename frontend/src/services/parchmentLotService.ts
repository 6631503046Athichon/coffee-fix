import { ParchmentLot } from '../types';
import { api } from './api';

export interface UpdateParchmentLotInput {
  status?: string;
  currentWeightKg?: number;
}

/**
 * Update a parchment lot
 */
export const updateParchmentLot = async (id: string, input: UpdateParchmentLotInput): Promise<ParchmentLot> => {
  const response = await api.patch<{ parchmentLot: any }>(`/parchment-lots/${id}`, input);
  return transformParchmentLotFromBackend(response.parchmentLot);
};

/**
 * Fetch all parchment lots, optionally filtered by processingBatchId or status
 */
export const getAllParchmentLots = async (
  processingBatchId?: string,
  status?: string
): Promise<ParchmentLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (processingBatchId) params.processingBatchId = processingBatchId;
    if (status) params.status = status;

    const response = await api.get<{ parchmentLots: any[] }>(
      '/parchment-lots',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.parchmentLots.map(transformParchmentLotFromBackend);
  } catch (error) {
    console.error('Failed to fetch parchment lots:', error);
    return [];
  }
};

/**
 * Transform parchment lot data from backend format to frontend format
 */
function transformParchmentLotFromBackend(backendLot: any): ParchmentLot {
  return {
    id: backendLot.id,
    processingBatchId: backendLot.processingBatchId,
    harvestLotId: backendLot.harvestLotId,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    moistureContent: backendLot.moistureContent,
    processType: backendLot.processType,
    status: backendLot.status,
  };
}
