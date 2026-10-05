import { HarvestLot } from '../../types';
import { api } from '../api';
import { isApiError } from '../apiError';
import {
  transformHarvestLotFromBackend,
  transformHarvestLotToBackend,
  transformHarvestLotUpdateToBackend,
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
 * Update an existing harvest lot. Sends only the fields given: the backend
 * writes every key it receives, so a field left out must not be sent as a
 * blank or zero default.
 */
export const updateHarvestLot = async (
  lotId: string,
  lotData: Partial<HarvestLot>
): Promise<HarvestLot> => {
  try {
    const response = await api.put<{ harvestLot: any }>(
      `/harvest-lots/${lotId}`,
      transformHarvestLotUpdateToBackend(lotData)
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
 * unprocessed. A processor may send only these four fields, so this keeps
 * just the given ones of them (anything else in `details` is dropped).
 * Errors are rethrown untouched so the caller can show the backend's own
 * reason (e.g. the lot was processed).
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

/** What the backend found linked to a processed lot it refused to delete. */
export interface HarvestLotDependents {
  processingBatches: number;
  parchmentLots: number;
  greenBeanLots: number;
  withdrawals: number;
}

/**
 * The backend refused to delete a harvest lot because it has been processed
 * (409). `dependents` counts what deleting it with everything linked would
 * remove; only an Admin may then ask for that (deleteHarvestLot cascade).
 */
export class HarvestLotProcessedError extends Error {
  readonly dependents: HarvestLotDependents;

  constructor(message: string, dependents: HarvestLotDependents) {
    super(message);
    this.name = 'HarvestLotProcessedError';
    this.dependents = dependents;
  }
}

const DEPENDENT_KEYS = ['processingBatches', 'parchmentLots', 'greenBeanLots', 'withdrawals'] as const;

const readDependents = (error: unknown): HarvestLotDependents | null => {
  if (!isApiError(error) || error.status !== 409) return null;
  const raw = (error.data as { dependents?: unknown } | null)?.dependents;
  if (!raw || typeof raw !== 'object') return null;
  const counts = raw as Record<string, unknown>;
  const dependents = {} as HarvestLotDependents;
  for (const key of DEPENDENT_KEYS) {
    const value = Number(counts[key] ?? 0);
    dependents[key] = Number.isFinite(value) ? value : 0;
  }
  return dependents;
};

/**
 * Delete a harvest lot. With ifUnprocessed the backend deletes it only while
 * it is still unprocessed, whoever asks. A processed lot is refused (409)
 * unless an Admin passes cascade, which deletes it with its whole chain
 * (batches, parchment lots, withdrawals, and the green bean lots made from it;
 * if any of those is still in use, nothing is deleted and the 409 message
 * lists them). A 409 that lists what is linked is thrown as
 * HarvestLotProcessedError; any other 409 keeps the backend's message as is.
 * With cascade, `expected` is what the Admin was shown: if more is linked by
 * now, the backend deletes nothing and answers with the new counts.
 */
export const deleteHarvestLot = async (
  lotId: string,
  options: { ifUnprocessed?: boolean; cascade?: boolean; expected?: HarvestLotDependents } = {}
): Promise<void> => {
  const { expected } = options;
  const query = [
    options.ifUnprocessed ? 'ifUnprocessed=1' : '',
    options.cascade ? 'cascade=1' : '',
    options.cascade && expected
      ? `expect=${DEPENDENT_KEYS.map(key => expected[key]).join(',')}`
      : '',
  ].filter(Boolean).join('&');
  try {
    await api.delete(`/harvest-lots/${lotId}${query ? `?${query}` : ''}`);
  } catch (error) {
    const dependents = readDependents(error);
    if (dependents) {
      throw new HarvestLotProcessedError((error as Error).message, dependents);
    }
    // A refusal says what to do (e.g. which green bean lots to void first),
    // and lot numbers like GBL-2026-404 must not read as an HTTP status.
    if (isApiError(error) && error.status === 409 && error.message) {
      throw new Error(error.message);
    }
    throw new Error(handleApiError(error, 'delete harvest lot'));
  }
};
