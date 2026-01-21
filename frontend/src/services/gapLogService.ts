import { GAPLogEntry } from '../types';
import { api } from './api';
import { transformGAPLogFromBackend } from './utils/transformers';

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
    console.error('Failed to fetch GAP logs:', error);
    return [];
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
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to create GAP log entry';
    
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
    
    if (errorMessage.includes('Activity type')) {
      throw new Error(errorMessage);
    }
    
    throw new Error(errorMessage);
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
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to update GAP log entry';
    
    // Provide user-friendly error messages
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Authentication failed. Please log in again and try updating the log.');
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
 * Delete a GAP log entry
 */
export const deleteGAPLog = async (logId: string): Promise<void> => {
  await api.delete(`/gap-logs/${logId}`);
};

