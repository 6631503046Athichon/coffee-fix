/**
 * Activity Type Service
 * Manages GAP Activity Types in localStorage
 */

import { ActivityType } from '../types';

const ACTIVITY_TYPES_STORAGE_KEY = 'coffee_lab_activity_types';

/**
 * Initialize activity types in localStorage with default values
 */
export const initializeActivityTypes = (defaultTypes: ActivityType[]) => {
  const stored = localStorage.getItem(ACTIVITY_TYPES_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(ACTIVITY_TYPES_STORAGE_KEY, JSON.stringify(defaultTypes));
  }
};

/**
 * Get all activity types from localStorage
 */
export const getAllActivityTypes = (): ActivityType[] => {
  const stored = localStorage.getItem(ACTIVITY_TYPES_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error parsing activity types from localStorage:', error);
      return [];
    }
  }
  return [];
};

/**
 * Save all activity types to localStorage
 */
const saveAllActivityTypes = (types: ActivityType[]) => {
  localStorage.setItem(ACTIVITY_TYPES_STORAGE_KEY, JSON.stringify(types));
};

/**
 * Add a new activity type
 */
export const addActivityType = (activityType: ActivityType) => {
  const all = getAllActivityTypes();
  all.unshift(activityType);
  saveAllActivityTypes(all);
};

/**
 * Update an existing activity type
 */
export const updateActivityType = (activityType: ActivityType) => {
  const all = getAllActivityTypes();
  const updated = all.map(t => t.id === activityType.id ? activityType : t);
  saveAllActivityTypes(updated);
};

/**
 * Delete an activity type
 */
export const deleteActivityType = (id: string) => {
  const all = getAllActivityTypes();
  const filtered = all.filter(t => t.id !== id);
  saveAllActivityTypes(filtered);
};

/**
 * Get active activity types only
 */
export const getActiveActivityTypes = (): ActivityType[] => {
  return getAllActivityTypes().filter(t => t.isActive);
};

/**
 * Check if activity type name already exists
 */
export const activityTypeNameExists = (name: string, excludeId?: string): boolean => {
  const all = getAllActivityTypes();
  return all.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId);
};
