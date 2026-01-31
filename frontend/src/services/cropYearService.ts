import { CropYear } from '../types';
import { api } from './api';
import { handleApiErrorWithFallback } from '../utils/errorHandler';

/**
 * Fetch all crop years from the backend API
 */
export const getAllCropYears = async (): Promise<CropYear[]> => {
  try {
    const response = await api.get<{ cropYears: any[] }>('/crop-years');
    console.log('[CropYearService] Fetched crop years:', response.cropYears?.length || 0);
    return response.cropYears.map((cy: any) => ({
      id: cy.id,
      year: cy.year,
      startDate: cy.startDate,
      endDate: cy.endDate,
      description: cy.description || undefined,
    }));
  } catch (error) {
    console.error('[CropYearService] Error fetching crop years:', error);
    return handleApiErrorWithFallback<CropYear[]>(error, {
      operation: 'fetch crop years',
      fallbackValue: [],
    });
  }
};

