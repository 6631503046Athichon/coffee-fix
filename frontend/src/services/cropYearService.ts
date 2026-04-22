import { CropYear } from '../types';
import { api } from './api';
import { handleApiError, handleApiErrorWithFallback } from '../utils/errorHandler';

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

/**
 * Create a new crop year
 */
export const createCropYear = async (data: {
  year: string;
  startDate: string;
  endDate: string;
  description?: string;
}): Promise<CropYear> => {
  try {
    const response = await api.post<{ cropYear: any; message: string }>('/crop-years', data);
    return {
      id: response.cropYear.id,
      year: response.cropYear.year,
      startDate: response.cropYear.startDate,
      endDate: response.cropYear.endDate,
      description: response.cropYear.description || undefined,
    };
  } catch (error) {
    throw new Error(handleApiError(error, 'create crop year'));
  }
};

/**
 * Update an existing crop year
 */
export const updateCropYear = async (
  id: string,
  data: Partial<{ year: string; startDate: string; endDate: string; description: string }>,
): Promise<CropYear> => {
  try {
    const response = await api.put<{ cropYear: any }>(`/crop-years/${id}`, data);
    return {
      id: response.cropYear.id,
      year: response.cropYear.year,
      startDate: response.cropYear.startDate,
      endDate: response.cropYear.endDate,
      description: response.cropYear.description || undefined,
    };
  } catch (error) {
    throw new Error(handleApiError(error, 'update crop year'));
  }
};

