/**
 * Coffee Variety Service
 * Fetches coffee varieties from backend API
 */

import { api } from '../api';
import { handleApiError } from '../../utils/errorHandler';

export interface CoffeeVariety {
  id: string;
  name: string;
  species: string;
  origin: string | null;
  description: string | null;
  characteristics: string | null;
  altitude: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all coffee varieties (with optional filters)
 */
export const getAllCoffeeVarieties = async (filters?: {
  search?: string;
  species?: string;
  isActive?: string;
}): Promise<CoffeeVariety[]> => {
  try {
    const params: Record<string, string> = {};
    if (filters?.search) params.search = filters.search;
    if (filters?.species) params.species = filters.species;
    if (filters?.isActive) params.isActive = filters.isActive;

    const queryString = Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const response = await api.get<{ coffeeVarieties: CoffeeVariety[] }>(`/coffee-varieties${queryString}`);
    return response.coffeeVarieties || [];
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch coffee varieties'));
  }
};

/**
 * Get all active coffee varieties from API
 */
export const getActiveCoffeeVarieties = async (): Promise<CoffeeVariety[]> => {
  return getAllCoffeeVarieties({ isActive: 'true' });
};

/**
 * Get variety names only (for dropdown options)
 */
export const getCoffeeVarietyNames = async (): Promise<string[]> => {
  const varieties = await getActiveCoffeeVarieties();
  return varieties.map(v => v.name);
};

/**
 * Create a new coffee variety
 */
export const addCoffeeVariety = async (data: Record<string, any>): Promise<CoffeeVariety> => {
  try {
    const response = await api.post<{ coffeeVariety: CoffeeVariety }>('/coffee-varieties', data);
    return response.coffeeVariety;
  } catch (error) {
    throw new Error(handleApiError(error, 'create coffee variety'));
  }
};

/**
 * Update a coffee variety
 */
export const updateCoffeeVariety = async (id: string, data: Record<string, any>): Promise<CoffeeVariety> => {
  try {
    const response = await api.put<{ coffeeVariety: CoffeeVariety }>(`/coffee-varieties/${id}`, data);
    return response.coffeeVariety;
  } catch (error) {
    throw new Error(handleApiError(error, 'update coffee variety'));
  }
};

/**
 * Delete a coffee variety
 */
export const deleteCoffeeVariety = async (id: string): Promise<void> => {
  try {
    await api.delete(`/coffee-varieties/${id}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete coffee variety'));
  }
};
