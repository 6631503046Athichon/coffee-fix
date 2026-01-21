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
  try {
    const response = await api.post<{ farm: any; message: string }>(
      '/farms',
      transformFarmToBackend(farmData)
    );
    return transformFarmFromBackend(response.farm);
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to create farm';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try submitting the form.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Update an existing farm
 */
export const updateFarm = async (farmId: string, farmData: Partial<Farm>): Promise<Farm> => {
  try {
    const response = await api.put<{ farm: any }>(
      `/farms/${farmId}`,
      transformFarmToBackend(farmData)
    );
    return transformFarmFromBackend(response.farm);
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to update farm';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try updating the farm.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      throw new Error('Connection timeout. Please check your internet connection and try again.');
    }
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
      throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
    }
    
    throw new Error(errorMessage);
  }
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
