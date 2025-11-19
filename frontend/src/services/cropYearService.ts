import { CropYear } from '../types';
import { api } from './api';

/**
 * Fetch all crop years from the backend API
 */
export const getAllCropYears = async (): Promise<CropYear[]> => {
  try {
    const response = await api.get<{ cropYears: any[] }>('/crop-years');
    return response.cropYears.map((cy: any) => ({
      id: cy.id,
      year: cy.year,
      startDate: cy.startDate,
      endDate: cy.endDate,
      description: cy.description || undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch crop years:', error);
    return [];
  }
};

