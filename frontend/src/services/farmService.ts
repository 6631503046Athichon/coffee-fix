import { Farm } from '../types';

const FARMS_STORAGE_KEY = 'coffee_lab_farms';

const dispatchStorageEvent = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('localStorageUpdate'));
  }
};

export const initializeFarms = (defaultFarms: Farm[]) => {
  if (typeof window === 'undefined') return;
  const stored = localStorage.getItem(FARMS_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(FARMS_STORAGE_KEY, JSON.stringify(defaultFarms));
  }
};

export const getAllFarms = (): Farm[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(FARMS_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored) as Farm[];
  } catch (error) {
    console.error('Failed to parse farms from localStorage:', error);
    return [];
  }
};

const saveAllFarms = (farms: Farm[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FARMS_STORAGE_KEY, JSON.stringify(farms));
  dispatchStorageEvent();
};

export const addFarm = (farm: Farm) => {
  const farms = getAllFarms();
  farms.push(farm);
  saveAllFarms(farms);
};

export const updateFarm = (updatedFarm: Farm) => {
  const farms = getAllFarms();
  const next = farms.map(f => (f.id === updatedFarm.id ? updatedFarm : f));
  saveAllFarms(next);
};

export const deleteFarm = (farmId: string) => {
  const farms = getAllFarms();
  const next = farms.filter(f => f.id !== farmId);
  saveAllFarms(next);
};
