import { WeatherRecord } from '../types';
import { api } from './api';
import {
  transformWeatherRecordFromBackend,
  transformWeatherRecordToBackend,
} from './utils/transformers';

/**
 * Fetch all weather records, optionally filtered by farm ID
 */
export const getAllWeatherRecords = async (farmId?: string): Promise<WeatherRecord[]> => {
  try {
    const params = farmId ? { farmId } : undefined;
    const response = await api.get<{ weatherRecords: any[] }>('/weather-records', params);
    return response.weatherRecords.map(transformWeatherRecordFromBackend);
  } catch (error) {
    console.error('Failed to fetch weather records:', error);
    return [];
  }
};

/**
 * Create a new weather record
 */
export const addWeatherRecord = async (
  recordData: Partial<WeatherRecord>
): Promise<WeatherRecord> => {
  const payload = transformWeatherRecordToBackend(recordData);
  console.log('[WeatherService] POST /weather-records payload:', payload);

  try {
    const response = await api.post<{ weatherRecord: any; message: string }>(
      '/weather-records',
      payload
    );
    console.log('[WeatherService] Response:', response);
    return transformWeatherRecordFromBackend(response.weatherRecord);
  } catch (error) {
    console.error('[WeatherService] Error saving record:', error);
    throw error;
  }
};

/**
 * Update an existing weather record
 */
export const updateWeatherRecord = async (
  recordId: string,
  recordData: Partial<WeatherRecord>
): Promise<WeatherRecord> => {
  const response = await api.put<{ weatherRecord: any }>(
    `/weather-records/${recordId}`,
    transformWeatherRecordToBackend(recordData)
  );
  return transformWeatherRecordFromBackend(response.weatherRecord);
};

/**
 * Delete a weather record
 */
export const deleteWeatherRecord = async (recordId: string): Promise<void> => {
  try {
    await api.delete(`/weather-records/${recordId}`);
  } catch (error) {
    // If backend no longer has this record, treat delete as idempotent success.
    if (error instanceof Error && error.message.toLowerCase().includes('record not found')) {
      console.warn('[WeatherService] Delete skipped, record already missing:', recordId);
      return;
    }
    throw error;
  }
};

// Legacy localStorage functions for backward compatibility
const WEATHER_RECORDS_STORAGE_KEY = 'coffee_lab_weather_records';

export const initializeWeatherRecords = (defaultRecords: WeatherRecord[]) => {
  localStorage.setItem(WEATHER_RECORDS_STORAGE_KEY, JSON.stringify(defaultRecords));
};

const saveAllWeatherRecords = (records: WeatherRecord[]) => {
  localStorage.setItem(WEATHER_RECORDS_STORAGE_KEY, JSON.stringify(records));
};
