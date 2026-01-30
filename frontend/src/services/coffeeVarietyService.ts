/**
 * Coffee Variety Service
 * Fetches coffee varieties from backend API
 */

import { api } from './api';

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

interface CoffeeVarietiesResponse {
  coffeeVarieties: CoffeeVariety[];
}

/**
 * Get all active coffee varieties from API
 */
export const getActiveCoffeeVarieties = async (): Promise<CoffeeVariety[]> => {
  try {
    const response = await api.get<CoffeeVarietiesResponse>('/coffee-varieties?isActive=true');
    return response.coffeeVarieties || [];
  } catch (error) {
    console.error('Error fetching coffee varieties:', error);
    return [];
  }
};

/**
 * Get variety names only (for dropdown options)
 */
export const getCoffeeVarietyNames = async (): Promise<string[]> => {
  const varieties = await getActiveCoffeeVarieties();
  return varieties.map(v => v.name);
};
