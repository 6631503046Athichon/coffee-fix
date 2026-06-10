import { WeatherRecord } from '../../types';
import { api } from '../api';
import {
  transformWeatherRecordFromBackend,
  transformWeatherRecordToBackend,
} from '../utils/transformers';

/**
 * Fetch all weather records, optionally filtered by farm ID
 */
export interface GetWeatherRecordsOptions {
  farmId?: string;
  /** Inclusive lower bound (YYYY-MM-DD). Records on/after this date. */
  startDate?: string;
  /** Inclusive upper bound (YYYY-MM-DD). Records on/before this date. */
  endDate?: string;
  /**
   * Max rows to return. Backend cap is 250,000 to accommodate worst-case
   * 5-minute × 2-year datasets. Caller should pick a value sized for the
   * date window: e.g. 5-min × 30 days ≈ 8,640 rows.
   */
  limit?: number;
}

/**
 * Fetch weather records, optionally scoped to a farm and date range.
 * Date params are passed through to the backend so the panel's date
 * filter does a server-side prune instead of pulling everything down
 * and filtering in the browser.
 */
export const getAllWeatherRecords = async (
  options?: string | GetWeatherRecordsOptions,
): Promise<WeatherRecord[]> => {
  try {
    // Back-compat: callers that pass a bare farmId string still work.
    const opts: GetWeatherRecordsOptions =
      typeof options === 'string' ? { farmId: options } : options || {};

    const params: Record<string, string> = {
      limit: String(opts.limit ?? 50000),
    };
    if (opts.farmId) params.farmId = opts.farmId;
    if (opts.startDate) params.startDate = opts.startDate;
    if (opts.endDate) params.endDate = opts.endDate;

    const response = await api.get<{ weatherRecords: any[] }>(
      '/weather-records',
      params,
    );
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

