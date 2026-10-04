import { useState, useEffect, useCallback } from 'react';

interface UseFormPersistOptions<T> {
  /** Unique key for localStorage */
  storageKey: string;
  /** Initial/default values for the form */
  initialValues: T;
  /** Whether to warn user before leaving page with unsaved changes */
  warnOnLeave?: boolean;
  /** Time in ms to debounce saves (default: 500ms) */
  debounceMs?: number;
}

interface UseFormPersistReturn<T> {
  /** Current form values */
  values: T;
  /** Update a single field */
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Update multiple fields at once */
  setValues: (newValues: Partial<T>) => void;
  /**
   * Fill in defaults the form picks by itself (current year, first variety).
   * Not a user change: it neither marks the form dirty nor saves a draft.
   */
  setDefaults: (newValues: Partial<T>) => void;
  /** Reset form to initial values and clear storage */
  resetForm: () => void;
  /** Clear saved data from storage (call after successful submit) */
  clearSavedData: () => void;
  /** Whether form has unsaved changes */
  isDirty: boolean;
  /** Whether data was restored from storage */
  wasRestored: boolean;
}

const STORAGE_PREFIX = 'form-persist-';

/**
 * Remove every saved form draft from this browser. Call on logout so the
 * next person to sign in here never sees, or inherits, someone else's draft.
 */
export function clearFormDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('[useFormPersist] Failed to clear saved drafts:', e);
  }
}

function loadSaved<T>(fullKey: string, initialValues: T): { values: T; restored: boolean } {
  try {
    const saved = localStorage.getItem(fullKey);
    if (saved) {
      // Merge with initial values to handle new fields
      return { values: { ...initialValues, ...JSON.parse(saved) }, restored: true };
    }
  } catch (e) {
    console.warn(`[useFormPersist] Failed to load saved data for ${fullKey}:`, e);
  }
  return { values: initialValues, restored: false };
}

/**
 * Hook to persist form data in localStorage
 * - Auto-saves form data as user types
 * - Restores data on page load
 * - Optionally warns user before leaving page
 *
 * Usage:
 * ```tsx
 * const { values, setValue, resetForm, clearSavedData } = useFormPersist({
 *   storageKey: 'harvest-lot-form',
 *   initialValues: { farmerName: '', weightKg: 0 },
 *   warnOnLeave: true,
 * });
 *
 * // On successful submit:
 * clearSavedData();
 * ```
 */
export function useFormPersist<T extends Record<string, any>>({
  storageKey,
  initialValues,
  warnOnLeave = true,
  debounceMs = 500,
}: UseFormPersistOptions<T>): UseFormPersistReturn<T> {
  const fullKey = `${STORAGE_PREFIX}${storageKey}`;

  // Try to load saved data on initial render
  const [values, setValuesState] = useState<T>(() => loadSaved(fullKey, initialValues).values);

  const [wasRestored, setWasRestored] = useState(() => loadSaved(fullKey, initialValues).restored);

  const [isDirty, setIsDirty] = useState(false);

  // A new key (another signed-in user) loads that key's own draft instead of
  // carrying the previous one's values over and saving them under it.
  const [loadedKey, setLoadedKey] = useState(fullKey);
  if (loadedKey !== fullKey) {
    const saved = loadSaved(fullKey, initialValues);
    setLoadedKey(fullKey);
    setValuesState(saved.values);
    setWasRestored(saved.restored);
    setIsDirty(false);
  }

  // Debounced save to localStorage
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(fullKey, JSON.stringify(values));
      } catch (e) {
        console.warn(`[useFormPersist] Failed to save data for ${storageKey}:`, e);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [values, isDirty, fullKey, storageKey, debounceMs]);

  // Warn user before leaving page
  useEffect(() => {
    if (!warnOnLeave || !isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [warnOnLeave, isDirty]);

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValuesState(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesState(prev => ({ ...prev, ...newValues }));
    setIsDirty(true);
  }, []);

  const setDefaults = useCallback((newValues: Partial<T>) => {
    setValuesState(prev => ({ ...prev, ...newValues }));
  }, []);

  const resetForm = useCallback(() => {
    setValuesState(initialValues);
    setIsDirty(false);
    setWasRestored(false);
    try {
      localStorage.removeItem(fullKey);
    } catch (e) {
      console.warn(`[useFormPersist] Failed to clear data for ${storageKey}:`, e);
    }
  }, [initialValues, fullKey, storageKey]);

  const clearSavedData = useCallback(() => {
    setIsDirty(false);
    setWasRestored(false);
    try {
      localStorage.removeItem(fullKey);
    } catch (e) {
      console.warn(`[useFormPersist] Failed to clear data for ${storageKey}:`, e);
    }
  }, [fullKey, storageKey]);

  return {
    values,
    setValue,
    setValues,
    setDefaults,
    resetForm,
    clearSavedData,
    isDirty,
    wasRestored,
  };
}

export default useFormPersist;
