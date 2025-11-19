import { Farm } from '../types';
import { api } from './api';
import { transformFarmFromBackend, transformFarmToBackend } from './utils/transformers';

/**
 * Fetch all farms from the backend API
 */
export const getAllFarms = async (): Promise<Farm[]> => {
  try {
    const response = await api.get<{ farms: any[] }>('/farms');
    return response.farms.map(transformFarmFromBackend);
  } catch (error) {
    console.error('Failed to fetch farms:', error);
    return [];
  }
};

/**
 * Create a new farm
 */
export const addFarm = async (farmData: Partial<Farm>): Promise<Farm> => {
  const response = await api.post<{ farm: any; message: string }>(
    '/farms',
    transformFarmToBackend(farmData)
  );
  return transformFarmFromBackend(response.farm);
};

/**
 * Update an existing farm
 */
export const updateFarm = async (farmId: string, farmData: Partial<Farm>): Promise<Farm> => {
  const response = await api.put<{ farm: any }>(
    `/farms/${farmId}`,
    transformFarmToBackend(farmData)
  );
  return transformFarmFromBackend(response.farm);
};

/**
 * Delete a farm
 */
export const deleteFarm = async (farmId: string): Promise<void> => {
  await api.delete(`/farms/${farmId}`);
};

// Legacy localStorage functions for backward compatibility
const FARMS_STORAGE_KEY = 'coffee_lab_farms';

const dispatchStorageEvent = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('localStorageUpdate'));
  }
};

export const initializeFarms = (defaultFarms: Farm[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FARMS_STORAGE_KEY, JSON.stringify(defaultFarms));
  dispatchStorageEvent();
};
