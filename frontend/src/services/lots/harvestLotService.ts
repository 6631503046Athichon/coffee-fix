import { HarvestLot } from '../../types';
import { api } from '../api';
import {
  transformHarvestLotFromBackend,
  transformHarvestLotToBackend,
} from '../utils/transformers';
import { handleApiError, handleApiErrorWithFallback } from '../../utils/errorHandler';

/**
 * Fetch all harvest lots, optionally filtered by farm ID or status
 */
export const getAllHarvestLots = async (
  farmId?: string,
  status?: string
): Promise<HarvestLot[]> => {
  try {
    const params: Record<string, string> = {};
    if (farmId) params.farmId = farmId;
    if (status) params.status = status;

    const response = await api.get<{ harvestLots: any[] }>(
      '/harvest-lots',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.harvestLots.map(transformHarvestLotFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<HarvestLot[]>(error, {
      operation: 'fetch harvest lots',
      fallbackValue: [],
    });
  }
};

/**
 * Fetch a single harvest lot by ID
 */
export const getHarvestLotById = async (lotId: string): Promise<HarvestLot | null> => {
  try {
    const response = await api.get<{ harvestLot: any }>(`/harvest-lots/${lotId}`);
    return transformHarvestLotFromBackend(response.harvestLot);
  } catch (error) {
    return handleApiErrorWithFallback<HarvestLot | null>(error, {
      operation: 'fetch harvest lot',
      fallbackValue: null,
    });
  }
};

/**
 * Create a new harvest lot
 */
export const addHarvestLot = async (lotData: Partial<HarvestLot>): Promise<HarvestLot> => {
  try {
    const response = await api.post<{ harvestLot: any; message: string }>(
      '/harvest-lots',
      transformHarvestLotToBackend(lotData)
    );
    return transformHarvestLotFromBackend(response.harvestLot);
  } catch (error) {
    throw new Error(handleApiError(error, 'create harvest lot'));
  }
};

/**
 * Update an existing harvest lot
 */
export const updateHarvestLot = async (
  lotId: string,
  lotData: Partial<HarvestLot>
): Promise<HarvestLot> => {
  try {
    const response = await api.put<{ harvestLot: any }>(
      `/harvest-lots/${lotId}`,
      transformHarvestLotToBackend(lotData)
    );
    return transformHarvestLotFromBackend(response.harvestLot);
  } catch (error) {
    throw new Error(handleApiError(error, 'update harvest lot'));
  }
};

/** The cherry-lot details a processor may correct on an unprocessed lot. */
export interface HarvestLotDetailsUpdate {
  cherryVariety?: string;
  weightKg?: number;
  farmPlotLocation?: string;
  harvestDate?: string; // YYYY-MM-DD
}

const HARVEST_LOT_DETAIL_FIELDS = [
  'cherryVariety',
  'weightKg',
  'farmPlotLocation',
  'harvestDate',
] as const;

// Asks the backend to refuse the write (409) once the lot has been processed,
// for every role, so a stale workbench list cannot edit or cascade-delete a
// lot that is already in use.
const IF_UNPROCESSED = '?ifUnprocessed=1';

/**
 * Update only a harvest lot's cherry details, and only while it is
 * unprocessed. updateHarvestLot runs the data through
 * transformHarvestLotToBackend, which fills in farmerName, status, cropYearId
 * and farmId defaults; a processor must not send those, so this sends only
 * the given ones of the four editable fields. Errors are rethrown untouched so
 * the caller can show the backend's own reason (e.g. the lot was processed).
 */
export const updateHarvestLotDetails = async (
  lotId: string,
  details: HarvestLotDetailsUpdate
): Promise<HarvestLot> => {
  const payload: HarvestLotDetailsUpdate = {};
  for (const field of HARVEST_LOT_DETAIL_FIELDS) {
    if (details[field] !== undefined) {
      (payload as Record<string, unknown>)[field] = details[field];
    }
  }
  const response = await api.put<{ harvestLot: unknown }>(
    `/harvest-lots/${lotId}${IF_UNPROCESSED}`,
    payload
  );
  return transformHarvestLotFromBackend(response.harvestLot);
};

/**
 * Delete a harvest lot. With ifUnprocessed the backend deletes it only while
 * it is still unprocessed, whoever asks.
 */
export const deleteHarvestLot = async (
  lotId: string,
  options: { ifUnprocessed?: boolean } = {}
): Promise<void> => {
  try {
    await api.delete(`/harvest-lots/${lotId}${options.ifUnprocessed ? IF_UNPROCESSED : ''}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete harvest lot'));
  }
};

