/**
 * Process Type Service
 * Manages Coffee Processing Types in localStorage
 */

import { ProcessType } from '../types';

const PROCESS_TYPES_STORAGE_KEY = 'coffee_lab_process_types';

/**
 * Initialize process types in localStorage with default values
 */
export const initializeProcessTypes = (defaultTypes: ProcessType[]) => {
  const stored = localStorage.getItem(PROCESS_TYPES_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(PROCESS_TYPES_STORAGE_KEY, JSON.stringify(defaultTypes));
  }
};

/**
 * Get all process types from localStorage
 */
export const getAllProcessTypes = (): ProcessType[] => {
  const stored = localStorage.getItem(PROCESS_TYPES_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return parsed;
    } catch (error) {
      console.error('Error parsing process types from localStorage:', error);
      return [];
    }
  }
  return [];
};

/**
 * Save all process types to localStorage
 */
const saveAllProcessTypes = (types: ProcessType[]) => {
  localStorage.setItem(PROCESS_TYPES_STORAGE_KEY, JSON.stringify(types));
  // Dispatch custom event to notify components about the change
  window.dispatchEvent(new Event('localStorageUpdate'));
};

/**
 * Add a new process type
 */
export const addProcessType = (processType: ProcessType) => {
  const all = getAllProcessTypes();
  all.unshift(processType);
  saveAllProcessTypes(all);
};

/**
 * Update an existing process type
 */
export const updateProcessType = (processType: ProcessType) => {
  const all = getAllProcessTypes();
  const updated = all.map(t => t.id === processType.id ? processType : t);
  saveAllProcessTypes(updated);
};

/**
 * Delete a process type
 */
export const deleteProcessType = (id: string) => {
  const all = getAllProcessTypes();
  const filtered = all.filter(t => t.id !== id);
  saveAllProcessTypes(filtered);
};

/**
 * Get active process types only
 */
export const getActiveProcessTypes = (): ProcessType[] => {
  return getAllProcessTypes().filter(t => t.isActive);
};

/**
 * Check if process type name already exists
 */
export const processTypeNameExists = (name: string, excludeId?: string): boolean => {
  const all = getAllProcessTypes();
  return all.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId);
};

/**
 * Reset process types to default values (force overwrite)
 */
export const resetProcessTypes = (defaultTypes: ProcessType[]) => {
  localStorage.setItem(PROCESS_TYPES_STORAGE_KEY, JSON.stringify(defaultTypes));
  // Notify listeners so UI reloads fresh data
  window.dispatchEvent(new Event('localStorageUpdate'));
};

/**
 * Ensure a process type exists (by name); if missing, create it.
 * Returns true if a new type was created, false if it already existed.
 */
export const ensureProcessTypeExists = (pt: Omit<ProcessType, 'id' | 'createdDate'> & { createdDate?: string }) => {
  const all = getAllProcessTypes();
  const exists = all.some(t => t.name.toLowerCase() === pt.name.toLowerCase());
  if (exists) return false;

  const newId = `PT${String(all.length + 1).padStart(3, '0')}`;
  const newType: ProcessType = {
    id: newId,
    name: pt.name,
    description: pt.description,
    colorScheme: pt.colorScheme,
    createdDate: pt.createdDate || new Date().toISOString().slice(0, 10),
    isActive: pt.isActive,
  };
  addProcessType(newType);
  return true;
};

/**
 * Ensure baseline default process types exist (Washed, Natural, Honey).
 * Non-destructive: only adds missing ones; keeps any admin-added types.
 */
export const ensureDefaultProcessTypes = () => {
  ensureProcessTypeExists({
    name: 'Washed',
    description: 'Washed process - cherries are pulped and fermented to remove mucilage before drying',
    colorScheme: {
      borderColor: 'border-l-blue-500',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-200'
    },
    isActive: true,
  });

  ensureProcessTypeExists({
    name: 'Natural',
    description: 'Natural process - cherries are dried whole with the fruit intact',
    colorScheme: {
      borderColor: 'border-l-amber-500',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      badgeColor: 'bg-amber-100 text-amber-700 border-amber-200'
    },
    isActive: true,
  });

  ensureProcessTypeExists({
    name: 'Honey',
    description: 'Honey process - cherries are pulped but some or all mucilage is left on during drying',
    colorScheme: {
      borderColor: 'border-l-yellow-500',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      badgeColor: 'bg-yellow-100 text-yellow-700 border-yellow-200'
    },
    isActive: true,
  });
};
