import { Farm } from '../../types';
import { api } from '../api';
import { isApiError } from '../apiError';
import { transformFarmFromBackend, transformFarmToBackend } from '../utils/transformers';
import { handleApiError, handleApiErrorWithFallback } from '../../utils/errorHandler';

/**
 * Fetch all farms from the backend API
 */
export const getAllFarms = async (): Promise<Farm[]> => {
  try {
    const response = await api.get<{ farms: any[] }>('/farms');
    return response.farms.map(transformFarmFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<Farm[]>(error, {
      operation: 'fetch farms',
      fallbackValue: [],
    });
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
  } catch (error) {
    throw new Error(handleApiError(error, 'create farm'));
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
  } catch (error) {
    throw new Error(handleApiError(error, 'update farm'));
  }
};

/**
 * Update weather auto-fetch settings for a farm (Admin only)
 */
export const updateFarmWeatherSettings = async (
  farmId: string,
  settings: { weatherAutoFetchEnabled: boolean; weatherAutoFetchInterval: number }
): Promise<Farm> => {
  try {
    const response = await api.put<{ farm: any }>(
      `/farms/${farmId}`,
      settings
    );
    return transformFarmFromBackend(response.farm);
  } catch (error) {
    throw new Error(handleApiError(error, 'update weather settings'));
  }
};

/**
 * What the backend found linked to a farm it refused to delete. Weather
 * records never block: they are deleted with the farm.
 */
export interface FarmDependents {
  harvestLots: number;
  gapLogs: number;
  soilAnalyses: number;
}

/**
 * The backend refused to delete a farm (409) because records are still
 * linked to it. `dependents` counts them; they have to be deleted or moved
 * first, by anyone, Admins included.
 */
export class FarmHasRecordsError extends Error {
  readonly dependents: FarmDependents;

  constructor(message: string, dependents: FarmDependents) {
    super(message);
    this.name = 'FarmHasRecordsError';
    this.dependents = dependents;
  }
}

const FARM_DEPENDENT_KEYS = ['harvestLots', 'gapLogs', 'soilAnalyses'] as const;

const readFarmDependents = (error: unknown): FarmDependents | null => {
  if (!isApiError(error) || error.status !== 409) return null;
  const raw = (error.data as { dependents?: unknown } | null)?.dependents;
  if (!raw || typeof raw !== 'object') return null;
  const counts = raw as Record<string, unknown>;
  const dependents = {} as FarmDependents;
  for (const key of FARM_DEPENDENT_KEYS) {
    const value = Number(counts[key] ?? 0);
    dependents[key] = Number.isFinite(value) ? value : 0;
  }
  return dependents;
};

/**
 * Delete a farm. A 409 that lists what is still linked is thrown as
 * FarmHasRecordsError; any other failure as an Error with the reason.
 */
export const deleteFarm = async (farmId: string): Promise<void> => {
  try {
    await api.delete(`/farms/${farmId}`);
  } catch (error) {
    const dependents = readFarmDependents(error);
    if (dependents) {
      throw new FarmHasRecordsError((error as Error).message, dependents);
    }
    throw new Error(handleApiError(error, 'delete farm'));
  }
};


