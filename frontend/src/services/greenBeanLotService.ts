import { GreenBeanLot } from '../types';
import { api } from './api';
import { handleApiErrorWithFallback } from '../utils/errorHandler';

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
    parchmentLotId: backendLot.parchmentLotId,
    grade: backendLot.grade,
    initialWeightKg: backendLot.initialWeightKg,
    currentWeightKg: backendLot.currentWeightKg,
    availabilityStatus: backendLot.availabilityStatus,
    sourceType: backendLot.sourceType || 'Internal',
    pricePerKg: backendLot.pricePerKg || undefined,
    currency: backendLot.currency || undefined,
    pricingDate: backendLot.pricingDate ? new Date(backendLot.pricingDate).toISOString().split('T')[0] : undefined,
    priceSetById: backendLot.priceSetById || undefined,
    cuppingScores: backendLot.cuppingScores || [],
    withdrawalHistory: backendLot.withdrawalHistory || [],
  };
}
