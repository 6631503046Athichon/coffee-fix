/**
 * Weather Auto-Fetch Background Service
 * ทำงานที่ระดับ App เพื่อให้ auto-fetch ทำงานต่อแม้ปิด modal
 * ใช้ค่า weatherAutoFetchEnabled/Interval จาก Farm model (database) แทน localStorage
 */

import { fetchWeatherData } from './weatherApiService';
import { addWeatherRecord } from './weatherService';
import { Farm, WeatherRecord } from '../../types';
import { logger } from '../../utils/logger';

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
  // Tracks farms with an in-flight POST so two concurrent fetches for the
  // same farm (e.g. StrictMode double-mount, rapid effect re-runs) don't
  // both POST a weather record and create a duplicate row.
  inFlight: Set<string>;
  onRecordSaved?: (record: WeatherRecord) => void;
}

const state: AutoFetchState = {
  configs: new Map(),
  intervals: new Map(),
  lastFetchTimes: new Map(),
  inFlight: new Set(),
};

// Load configs from Farm data (database)
const loadConfigsFromFarms = (farms: Farm[], userId?: string): void => {
  farms.forEach(farm => {
    if (farm.weatherAutoFetchEnabled && farm.latitude && farm.longitude) {
      const config: FarmAutoFetchConfig = {
        farmId: farm.id,
        farmName: farm.name || farm.location,
        latitude: farm.latitude,
        longitude: farm.longitude,
        location: farm.location,
        interval: farm.weatherAutoFetchInterval || 5,
        enabled: true,
        userId,
      };
      state.configs.set(farm.id, config);
    }
  });
};

// Update config for a single farm (called after admin toggles)
export const updateFarmConfig = (farm: Farm, userId?: string): void => {
  const config: FarmAutoFetchConfig = {
    farmId: farm.id,
    farmName: farm.name || farm.location,
    latitude: farm.latitude || 0,
    longitude: farm.longitude || 0,
    location: farm.location,
    interval: farm.weatherAutoFetchInterval || 5,
    enabled: farm.weatherAutoFetchEnabled || false,
    userId,
  };

  state.configs.set(farm.id, config);

  if (config.enabled && farm.latitude && farm.longitude) {
    startFarmInterval(farm.id);
  } else {
    stopFarmInterval(farm.id);
  }
};

// Fetch weather for a specific farm
const fetchWeatherForFarm = async (farmId: string): Promise<void> => {
  const config = state.configs.get(farmId);
  if (!config || !config.enabled) return;

  // In-flight guard: a second call while the first is still awaiting would
  // otherwise see no lastFetchTime (since the original sets it only after
  // the POST resolves) and produce a duplicate record. Bail early when a
  // fetch is already running for this farm.
  if (state.inFlight.has(farmId)) {
    logger.debug(
      `[WeatherAutoFetch] Skipping — fetch already in flight for ${config.farmName}`,
    );
    return;
  }

  state.inFlight.add(farmId);
  // Claim the slot synchronously (before awaiting). Any caller that races
  // in while we're awaiting the API will see a fresh lastFetchTime in the
  // immediate-fetch gate and skip its own immediate fetch.
  state.lastFetchTimes.set(farmId, new Date());

  logger.debug(`[WeatherAutoFetch] Fetching weather for farm: ${config.farmName}`);

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

      logger.debug(`[WeatherAutoFetch] Saved weather record for farm: ${config.farmName}`, { newRecord });

      // Callback to update UI if provided
      if (state.onRecordSaved) {
        state.onRecordSaved(newRecord);
      }
    }
  } catch (error) {
    logger.error(`[WeatherAutoFetch] Error fetching weather for farm ${config.farmName}`, error);
  } finally {
    state.inFlight.delete(farmId);
  }
};

// Start interval for a farm
const startFarmInterval = (farmId: string): void => {
  // Clear existing interval
  stopFarmInterval(farmId);

  const config = state.configs.get(farmId);
  if (!config || !config.enabled) return;

  const intervalMs = config.interval * 60 * 1000;

  logger.debug(`[WeatherAutoFetch] Starting auto-fetch for farm: ${config.farmName} every ${config.interval} minutes`);

  // Fire an immediate fetch only if we haven't already fetched recently.
  // React StrictMode mounts effects twice in dev, and any data refresh
  // (e.g. the 2-minute version-check poll in App.tsx) re-runs the effect
  // that calls startFarmInterval — without this gate we'd POST a fresh
  // weather record every re-init, producing one row per minute instead
  // of one per `config.interval` minutes.
  const lastFetch = state.lastFetchTimes.get(farmId);
  const elapsed = lastFetch ? Date.now() - lastFetch.getTime() : Infinity;
  if (elapsed >= intervalMs) {
    fetchWeatherForFarm(farmId);
  } else {
    logger.debug(
      `[WeatherAutoFetch] Skipping immediate fetch for ${config.farmName}; last fetch ${Math.round(elapsed / 1000)}s ago, interval ${config.interval}min`,
    );
  }

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
    logger.debug(`[WeatherAutoFetch] Stopped auto-fetch for farm: ${farmId}`);
  }
};

// Initialize the service with farm data from API
export const initWeatherAutoFetchService = (
  farms: Farm[],
  onRecordSaved?: (record: WeatherRecord) => void,
  userId?: string
): void => {
  logger.debug('[WeatherAutoFetch] Initializing service...');

  state.onRecordSaved = onRecordSaved;
  loadConfigsFromFarms(farms, userId);

  // Start intervals for all enabled farms
  state.configs.forEach((config, farmId) => {
    if (config.enabled) {
      startFarmInterval(farmId);
    }
  });

  logger.debug(`[WeatherAutoFetch] Service initialized with ${state.configs.size} farm(s)`);
};

// Stop the service
export const stopWeatherAutoFetchService = (): void => {
  logger.debug('[WeatherAutoFetch] Stopping service...');
  state.intervals.forEach((_, farmId) => {
    stopFarmInterval(farmId);
  });
  state.configs.clear();
};

