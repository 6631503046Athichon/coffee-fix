import { GAPLogEntry } from '../types';
import { api } from './api';
import { transformGAPLogFromBackend } from './utils/transformers';
import { handleApiError, handleApiErrorWithFallback } from '../utils/errorHandler';

/**
 * Find activity type ID by name
 */
const findActivityTypeId = async (activityTypeName: string): Promise<string> => {
  const response = await api.get<{ activityTypes: any[] }>('/activity-types');
  const activityType = response.activityTypes.find((at: any) => at.name === activityTypeName);
  
  if (!activityType) {
    throw new Error(`Activity type "${activityTypeName}" not found`);
  }
  
  return activityType.id;
};

/**
 * Fetch all GAP logs, optionally filtered by farm ID or activity type ID
 */
export const getAllGAPLogs = async (
  farmId?: string,
  activityTypeId?: string
): Promise<GAPLogEntry[]> => {
  try {
    const params: Record<string, string> = {};
    if (farmId) params.farmId = farmId;
    if (activityTypeId) params.activityTypeId = activityTypeId;

    const response = await api.get<{ gapLogs: any[] }>(
      '/gap-logs',
      Object.keys(params).length > 0 ? params : undefined
    );
    return response.gapLogs.map(transformGAPLogFromBackend);
  } catch (error) {
    return handleApiErrorWithFallback<GAPLogEntry[]>(error, {
      operation: 'fetch GAP logs',
      fallbackValue: [],
    });
  }
};

/**
 * Create a new GAP log entry
 */
export const addGAPLog = async (logData: Partial<GAPLogEntry>): Promise<GAPLogEntry> => {
  try {
    if (!logData.activityType) {
      throw new Error('Activity type is required');
    }

    const activityTypeId = await findActivityTypeId(logData.activityType);

    const response = await api.post<{ gapLog: any; message: string }>('/gap-logs', {
      farmId: logData.farmId || null,
      farmPlotLocation: logData.farmPlotLocation || '',
      activityTypeId,
      date: logData.date,
      productUsed: logData.productUsed || '',
      quantity: logData.quantity || '',
      notes: logData.notes || null,
    });

    return transformGAPLogFromBackend(response.gapLog);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create GAP log entry';

    // Preserve specific "Activity type" errors
    if (errorMessage.includes('Activity type')) {
      throw new Error(errorMessage);
    }

    throw new Error(handleApiError(error, 'create GAP log entry'));
  }
};

/**
 * Update an existing GAP log entry
 */
export const updateGAPLog = async (
  logId: string,
  logData: Partial<GAPLogEntry>
): Promise<GAPLogEntry> => {
  try {
    const updatePayload: any = {
      farmId: logData.farmId,
      farmPlotLocation: logData.farmPlotLocation,
      date: logData.date,
      productUsed: logData.productUsed,
      quantity: logData.quantity,
      notes: logData.notes,
    };

    // Find activity type ID if activity type name is provided
    if (logData.activityType) {
      updatePayload.activityTypeId = await findActivityTypeId(logData.activityType);
    }

    const response = await api.put<{ gapLog: any }>(`/gap-logs/${logId}`, updatePayload);
    return transformGAPLogFromBackend(response.gapLog);
  } catch (error) {
    throw new Error(handleApiError(error, 'update GAP log entry'));
  }
};

/**
 * Delete a GAP log entry
 */
export const deleteGAPLog = async (logId: string): Promise<void> => {
  try {
    await api.delete(`/gap-logs/${logId}`);
  } catch (error) {
    throw new Error(handleApiError(error, 'delete GAP log entry'));
  }
};

