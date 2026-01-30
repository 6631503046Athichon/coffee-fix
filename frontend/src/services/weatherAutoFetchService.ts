/**
 * Weather Auto-Fetch Background Service
 * ทำงานที่ระดับ App เพื่อให้ auto-fetch ทำงานต่อแม้ปิด modal
 */

import { fetchWeatherData } from './weatherApiService';
import { addWeatherRecord } from './weatherService';
import { WeatherRecord } from '../types';

interface FarmAutoFetchConfig {
  farmId: string;
  farmName: string;
  latitude: number;
  longitude: number;
  location: string;
  interval: number; // minutes
  enabled: boolean;
  userId?: string;
}

interface AutoFetchState {
  configs: Map<string, FarmAutoFetchConfig>;
  intervals: Map<string, NodeJS.Timeout>;
  lastFetchTimes: Map<string, Date>;
  onRecordSaved?: (record: WeatherRecord) => void;
}

const state: AutoFetchState = {
  configs: new Map(),
  intervals: new Map(),
  lastFetchTimes: new Map(),
};

// Load configs from localStorage
const loadConfigsFromStorage = (): void => {
  if (typeof window === 'undefined') return;

  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('weatherAutoFetch_') && !key.includes('Interval')) {
      const farmId = key.replace('weatherAutoFetch_', '');
      const enabled = localStorage.getItem(key) === 'true';
      const interval = parseInt(localStorage.getItem(`weatherAutoFetchInterval_${farmId}`) || '5', 10);
      const configJson = localStorage.getItem(`weatherAutoFetchConfig_${farmId}`);

      if (enabled && configJson) {
        try {
          const config = JSON.parse(configJson) as FarmAutoFetchConfig;
          config.enabled = enabled;
          config.interval = interval;
          state.configs.set(farmId, config);
        } catch (e) {
          console.error('[WeatherAutoFetch] Failed to parse config for farm:', farmId, e);
        }
      }
    }
  });
};

// Save farm config to localStorage
export const saveFarmConfig = (config: FarmAutoFetchConfig): void => {
  if (typeof window === 'undefined') return;

  localStorage.setItem(`weatherAutoFetchConfig_${config.farmId}`, JSON.stringify(config));
  localStorage.setItem(`weatherAutoFetch_${config.farmId}`, config.enabled.toString());
  localStorage.setItem(`weatherAutoFetchInterval_${config.farmId}`, config.interval.toString());

  state.configs.set(config.farmId, config);

  // Restart interval if enabled
  if (config.enabled) {
    startFarmInterval(config.farmId);
  } else {
    stopFarmInterval(config.farmId);
  }
};

// Fetch weather for a specific farm
const fetchWeatherForFarm = async (farmId: string): Promise<void> => {
  const config = state.configs.get(farmId);
  if (!config || !config.enabled) return;

  console.log(`[WeatherAutoFetch] Fetching weather for farm: ${config.farmName}`);

  try {
    const weatherData = await fetchWeatherData(config.latitude, config.longitude);

    if (weatherData) {
      const weatherRecord: Partial<WeatherRecord> = {
        farmId: config.farmId,
        farmPlotLocation: config.location,
        recordDate: new Date().toISOString().substring(0, 10),
        temperatureMin: weatherData.temperatureMin,
        temperatureMax: weatherData.temperatureMax,
        temperatureAvg: (weatherData.temperatureMin + weatherData.temperatureMax) / 2,
        rainfall: weatherData.rainfall,
        humidity: weatherData.humidity || 70,
        source: 'API',
        notes: `ดึงข้อมูลอัตโนมัติจาก Open-Meteo API เมื่อ ${new Date().toLocaleString('th-TH')}`,
        recordedBy: config.userId,
      };

      const newRecord = await addWeatherRecord(weatherRecord as Omit<WeatherRecord, 'id'>);
      state.lastFetchTimes.set(farmId, new Date());

      console.log(`[WeatherAutoFetch] Saved weather record for farm: ${config.farmName}`, newRecord);

      // Callback to update UI if provided
      if (state.onRecordSaved) {
        state.onRecordSaved(newRecord);
      }
    }
  } catch (error) {
    console.error(`[WeatherAutoFetch] Error fetching weather for farm ${config.farmName}:`, error);
  }
};

// Start interval for a farm
const startFarmInterval = (farmId: string): void => {
  // Clear existing interval
  stopFarmInterval(farmId);

  const config = state.configs.get(farmId);
  if (!config || !config.enabled) return;

  const intervalMs = config.interval * 60 * 1000;

  console.log(`[WeatherAutoFetch] Starting auto-fetch for farm: ${config.farmName} every ${config.interval} minutes`);

  // Fetch immediately
  fetchWeatherForFarm(farmId);

  // Set up interval
  const intervalId = setInterval(() => {
    fetchWeatherForFarm(farmId);
  }, intervalMs);

  state.intervals.set(farmId, intervalId);
};

// Stop interval for a farm
const stopFarmInterval = (farmId: string): void => {
  const intervalId = state.intervals.get(farmId);
  if (intervalId) {
    clearInterval(intervalId);
    state.intervals.delete(farmId);
    console.log(`[WeatherAutoFetch] Stopped auto-fetch for farm: ${farmId}`);
  }
};

// Initialize the service
export const initWeatherAutoFetchService = (onRecordSaved?: (record: WeatherRecord) => void): void => {
  console.log('[WeatherAutoFetch] Initializing service...');

  state.onRecordSaved = onRecordSaved;
  loadConfigsFromStorage();

  // Start intervals for all enabled farms
  state.configs.forEach((config, farmId) => {
    if (config.enabled) {
      startFarmInterval(farmId);
    }
  });

  console.log(`[WeatherAutoFetch] Service initialized with ${state.configs.size} farm(s)`);
};

// Stop the service
export const stopWeatherAutoFetchService = (): void => {
  console.log('[WeatherAutoFetch] Stopping service...');
  state.intervals.forEach((_, farmId) => {
    stopFarmInterval(farmId);
  });
  state.configs.clear();
};

// Get next fetch time for a farm
export const getNextFetchTime = (farmId: string): Date | null => {
  const config = state.configs.get(farmId);
  const lastFetch = state.lastFetchTimes.get(farmId);

  if (!config || !config.enabled || !lastFetch) return null;

  return new Date(lastFetch.getTime() + config.interval * 60 * 1000);
};

// Check if auto-fetch is running for a farm
export const isAutoFetchRunning = (farmId: string): boolean => {
  return state.intervals.has(farmId);
};

// Get all active farm IDs
export const getActiveFarmIds = (): string[] => {
  return Array.from(state.intervals.keys());
};
