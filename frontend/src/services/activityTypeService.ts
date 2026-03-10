/**
 * Activity Type Service
 * Fetches GAP Activity Types from Backend API
 */

import { ActivityType } from '../types';
import { api } from './api';

interface ActivityTypeResponse {
  activityTypes: Array<{
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
  }>;
}

interface SingleActivityTypeResponse {
  activityType: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
  };
}

/**
 * Map API response to frontend ActivityType format
 */
const mapActivityType = (at: any): ActivityType => ({
  id: at.id,
  name: at.name,
  description: at.description || undefined,
  isActive: at.isActive,
  createdDate: at.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
});

/**
 * Get all activity types from API
 */
export const getAllActivityTypes = async (): Promise<ActivityType[]> => {
  try {
    const data = await api.get<ActivityTypeResponse>('/activity-types');
    return (data.activityTypes || []).map(mapActivityType);
  } catch (error) {
    console.error('Error fetching activity types:', error);
    return [];
  }
};

/**
 * Get active activity types only
 */
export const getActiveActivityTypes = async (): Promise<ActivityType[]> => {
  try {
    const data = await api.get<ActivityTypeResponse>('/activity-types', { isActive: 'true' });
    return (data.activityTypes || []).map(mapActivityType);
  } catch (error) {
    console.error('Error fetching active activity types:', error);
    return [];
  }
};

/**
 * Add a new activity type
 */
export const addActivityType = async (activityType: { name: string; description?: string; isActive: boolean }): Promise<ActivityType> => {
  const data = await api.post<SingleActivityTypeResponse>('/activity-types', {
    name: activityType.name,
    description: activityType.description || null,
    isActive: activityType.isActive,
  });
  return mapActivityType(data.activityType);
};

/**
 * Update an existing activity type
 */
export const updateActivityType = async (id: string, updates: { name?: string; description?: string; isActive?: boolean }): Promise<ActivityType> => {
  const data = await api.put<SingleActivityTypeResponse>(`/activity-types/${id}`, updates);
  return mapActivityType(data.activityType);
};

/**
 * Delete an activity type
 */
export const deleteActivityType = async (id: string): Promise<void> => {
  await api.delete(`/activity-types/${id}`);
};

/**
 * Check if activity type name already exists
 */
export const activityTypeNameExists = async (name: string, excludeId?: string): Promise<boolean> => {
  const all = await getAllActivityTypes();
  return all.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId);
};
