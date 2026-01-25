import { GreenBeanLot } from '../types';
import { api } from './api';
import { handleApiErrorWithFallback } from '../utils/errorHandler';

export interface CreateGreenBeanLotInput {
  sourceType: 'Internal' | 'External';
  parchmentLotId?: string;
  grade: string;
  initialWeightKg: number;
  currentWeightKg?: number;
  availabilityStatus?: string;
  pricePerKg?: number;
  currency?: string;
  externalSource?: {
    originName?: string;
    variety?: string;
    processType?: string;
    purchaseDate?: string;
    pricePerKg?: number;
    currency?: string;
    supplierNotes?: string;
  };
}

/**
 * Create a new green bean lot
 */
export const createGreenBeanLot = async (input: CreateGreenBeanLotInput): Promise<GreenBeanLot> => {
  const response = await api.post<{ greenBeanLot: any }>('/green-bean-lots', input);
  return transformGreenBeanLotFromBackend(response.greenBeanLot);
};

/**
 * Fetch all green bean lots, optionally filtered by sourceType, availabilityStatus, or parchmentLotId
 */
export const getAllGreenBeanLots = async (
  sourceType?: string,
  availabilityStatus?: string,
  parchmentLotId?: string
): Promise<GreenBeanLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (sourceType) params.sourceType = sourceType;
    if (availabilityStatus) params.availabilityStatus = availabilityStatus;
    if (parchmentLotId) params.parchmentLotId = parchmentLotId;

    const response = await api.get<{ greenBeanLots: any[] }>(
      '/green-bean-lots',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.greenBeanLots.map(transformGreenBeanLotFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<GreenBeanLot[]>(error, {
      operation: 'fetch green bean lots',
      fallbackValue: [],
    });
  }
};

/**
 * Transform green bean lot data from backend format to frontend format
 */
function transformGreenBeanLotFromBackend(backendLot: any): GreenBeanLot {
  return {
    id: backendLot.id,
    sourceType: backendLot.sourceType || 'Internal',
    parchmentLotId: backendLot.parchmentLotId,
    externalSource: backendLot.externalSource,
    grade: backendLot.grade,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    availabilityStatus: backendLot.availabilityStatus,
    cuppingScores: backendLot.cuppingScores || [],
    withdrawalHistory: backendLot.withdrawalHistory || [],
  };
}
