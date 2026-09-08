/**
 * Coffee Grade Service
 * Fetches coffee grades from backend API
 */

import { api } from '../api';
import { handleApiError } from '../../utils/errorHandler';
import type { CoffeeGrade } from '../../types';

/**
 * Get all coffee grades (with optional filters)
 */
export const getAllCoffeeGrades = async (filters?: {
  search?: string;
  isActive?: string;
}): Promise<CoffeeGrade[]> => {
  try {
    const params: Record<string, string> = {};
    if (filters?.search) params.search = filters.search;
    if (filters?.isActive) params.isActive = filters.isActive;

    const queryString = Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const response = await api.get<{ coffeeGrades: CoffeeGrade[] }>(`/coffee-grades${queryString}`);
    return response.coffeeGrades || [];
  } catch (error) {
    throw new Error(handleApiError(error, 'fetch coffee grades'));
  }
};

/**
 * Get all active coffee grades from API
 */
export const getActiveCoffeeGrades = async (): Promise<CoffeeGrade[]> => {
  return getAllCoffeeGrades({ isActive: 'true' });
};

/**
 * Create a new coffee grade
 */
export const addCoffeeGrade = async (data: Record<string, any>): Promise<CoffeeGrade> => {
  try {
    const response = await api.post<{ coffeeGrade: CoffeeGrade }>('/coffee-grades', data);
    return response.coffeeGrade;
  } catch (error) {
    throw new Error(handleApiError(error, 'create coffee grade'));
  }
};

/**
 * Update a coffee grade
 */
export const updateCoffeeGrade = async (id: string, data: Record<string, any>): Promise<CoffeeGrade> => {
  try {
    const response = await api.put<{ coffeeGrade: CoffeeGrade }>(`/coffee-grades/${id}`, data);
    return response.coffeeGrade;
  } catch (error) {
    throw new Error(handleApiError(error, 'update coffee grade'));
  }
};

/**
 * Delete a coffee grade
 */
export const deleteCoffeeGrade = async (id: string): Promise<void> => {
  try {
    await api.delete(`/coffee-grades/${id}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete coffee grade'));
  }
};
