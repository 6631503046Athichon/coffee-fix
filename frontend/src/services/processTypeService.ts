/**
 * Process Type Service
 * Fetches Coffee Processing Types from Backend API
 */

import { ProcessType } from '../types';
import { api } from './api';

interface ProcessTypeResponse {
  processTypes: Array<{
    id: string;
    name: string;
    description: string | null;
    colorScheme: Record<string, string>;
    isActive: boolean;
    createdAt: string;
  }>;
}

interface SingleProcessTypeResponse {
  processType: {
    id: string;
    name: string;
    description: string | null;
    colorScheme: Record<string, string>;
    isActive: boolean;
    createdAt: string;
  };
}

/**
 * Map API response to frontend ProcessType format
 */
const mapProcessType = (pt: any): ProcessType => ({
  id: pt.id,
  name: pt.name,
  description: pt.description || '',
  colorScheme: pt.colorScheme || {},
  isActive: pt.isActive,
  createdDate: pt.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
});

/**
 * Get all process types from API
 */
export const getAllProcessTypes = async (): Promise<ProcessType[]> => {
  try {
    const data = await api.get<ProcessTypeResponse>('/process-types');
    return (data.processTypes || []).map(mapProcessType);
  } catch (error) {
    console.error('Error fetching process types:', error);
    return [];
  }
};

/**
 * Get active process types only
 */
export const getActiveProcessTypes = async (): Promise<ProcessType[]> => {
  try {
    const data = await api.get<ProcessTypeResponse>('/process-types', { isActive: 'true' });
    return (data.processTypes || []).map(mapProcessType);
  } catch (error) {
    console.error('Error fetching active process types:', error);
    return [];
  }
};

/**
 * Add a new process type
 */
export const addProcessType = async (processType: Omit<ProcessType, 'id'>): Promise<ProcessType | null> => {
  try {
    const data = await api.post<SingleProcessTypeResponse>('/process-types', {
      name: processType.name,
      description: processType.description,
      colorScheme: processType.colorScheme,
      isActive: processType.isActive,
    });
    return mapProcessType(data.processType);
  } catch (error) {
    console.error('Error adding process type:', error);
    return null;
  }
};

/**
 * Update an existing process type
 */
export const updateProcessType = async (processType: ProcessType): Promise<ProcessType | null> => {
  try {
    const data = await api.patch<SingleProcessTypeResponse>(`/process-types/${processType.id}`, {
      name: processType.name,
      description: processType.description,
      colorScheme: processType.colorScheme,
      isActive: processType.isActive,
    });
    return mapProcessType(data.processType);
  } catch (error) {
    console.error('Error updating process type:', error);
    return null;
  }
};

/**
 * Delete a process type
 */
export const deleteProcessType = async (id: string): Promise<boolean> => {
  try {
    await api.delete(`/process-types/${id}`);
    return true;
  } catch (error) {
    console.error('Error deleting process type:', error);
    return false;
  }
};

export const processTypeNameExists = async (name: string, excludeId?: string): Promise<boolean> => {
  const all = await getAllProcessTypes();
  return all.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId);
};
