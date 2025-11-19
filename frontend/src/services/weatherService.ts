import { WeatherRecord } from '../types';

const WEATHER_RECORDS_STORAGE_KEY = 'coffee_lab_weather_records';

/**
 * Initialize weather records in localStorage - always reset to defaults
 */
export const initializeWeatherRecords = (defaultRecords: WeatherRecord[]) => {
  // Always set to default records (will be empty array now that mock data is removed)
  localStorage.setItem(WEATHER_RECORDS_STORAGE_KEY, JSON.stringify(defaultRecords));
};

/**
 * Get all weather records from localStorage
 */
export const getAllWeatherRecords = (): WeatherRecord[] => {
  const storedRecords = localStorage.getItem(WEATHER_RECORDS_STORAGE_KEY);
  if (storedRecords) {
    try {
      return JSON.parse(storedRecords);
    } catch (error) {
      console.error('Error parsing weather records from localStorage:', error);
      return [];
    }
  }
  return [];
};

/**
 * Save all weather records to localStorage
 */
export const saveAllWeatherRecords = (records: WeatherRecord[]) => {
  localStorage.setItem(WEATHER_RECORDS_STORAGE_KEY, JSON.stringify(records));
};

/**
 * Add a new weather record
 */
export const addWeatherRecord = (record: WeatherRecord) => {
  const allRecords = getAllWeatherRecords();
  allRecords.unshift(record); // Add to beginning of array
  saveAllWeatherRecords(allRecords);
};

/**
 * Update a weather record
 */
export const updateWeatherRecord = (updatedRecord: WeatherRecord) => {
  const allRecords = getAllWeatherRecords();
  const updatedRecords = allRecords.map(record =>
    record.id === updatedRecord.id ? updatedRecord : record
  );
  saveAllWeatherRecords(updatedRecords);
};

/**
 * Delete a weather record
 */
export const deleteWeatherRecord = (recordId: string) => {
  const allRecords = getAllWeatherRecords();
  const filteredRecords = allRecords.filter(record => record.id !== recordId);
  saveAllWeatherRecords(filteredRecords);
};
