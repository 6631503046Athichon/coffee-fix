import { PricingHistory } from '../types';
import { api } from './api';
import { handleApiError } from '../utils/errorHandler';

function transformPricingHistoryFromBackend(ph: any): PricingHistory {
  return {
    id: ph.id,
    greenBeanLotId: ph.greenBeanLotId,
    pricePerKg: ph.pricePerKg,
    currency: ph.currency,
    effectiveDate: ph.effectiveDate?.split('T')[0] || ph.effectiveDate,
    setBy: ph.setBy || ph.setter?.name || '',
    notes: ph.notes || undefined,
  };
}

export const getAllPricingHistory = async (
  greenBeanLotId?: string
): Promise<PricingHistory[]> => {
  try {
    const params = greenBeanLotId ? { greenBeanLotId } : undefined;
    const response = await api.get<{ pricingHistory: any[] }>(
      '/pricing-history',
      params
    );
    return (response.pricingHistory || []).map(transformPricingHistoryFromBackend);
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch pricing history'));
  }
};

export const addPricingHistory = async (data: {
  greenBeanLotId: string;
  pricePerKg: number;
  currency: string;
  effectiveDate?: string;
  notes?: string;
}): Promise<PricingHistory> => {
  try {
    const response = await api.post<{ pricingHistory: any; message: string }>(
      '/pricing-history',
      data
    );
    return transformPricingHistoryFromBackend(response.pricingHistory);
  } catch (error) {
    throw new Error(handleApiError(error, 'create pricing history'));
  }
};
