/**
 * Weather API Service
 * Uses Open-Meteo API to fetch weather data (free, no API key required)
 * API Documentation: https://open-meteo.com/en/docs
 */

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    rain: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    rain_sum: number[];
  };
}

interface WeatherData {
  temperatureMin: number;
  temperatureMax: number;
  temperatureAvg: number;
  humidity: number;
  rainfall: number;
  recordDate: string;
}

// Development/testing flag to simulate API failures
// Can be set via localStorage: localStorage.setItem('weatherApiSimulateFailure', 'true')
// Or via localStorage.setItem('weatherApiSimulateTimeout', 'true')
const shouldSimulateFailure = (): 'failure' | 'timeout' | null => {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem('weatherApiSimulateFailure') === 'true') return 'failure';
  if (localStorage.getItem('weatherApiSimulateTimeout') === 'true') return 'timeout';
  return null;
};

/**
 * Fetch weather data from Open-Meteo API
 * @param latitude - Farm latitude
 * @param longitude - Farm longitude
 * @returns Weather data or null if failed
 */
export const fetchWeatherData = async (
  latitude: number,
  longitude: number
): Promise<WeatherData | null> => {
  // Check for simulation flags (for testing)
  const simulationMode = shouldSimulateFailure();

  if (simulationMode === 'failure') {
    // Simulate API failure
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay to simulate network
    throw new Error('Simulated API failure: Weather service is temporarily unavailable. Please try again later or enter data manually.');
  }

  if (simulationMode === 'timeout') {
    // Simulate timeout
    await new Promise(resolve => setTimeout(resolve, 15000)); // Wait longer than typical timeout
    throw new Error('Simulated timeout: Request took too long. The weather API may be slow or unavailable. Please try again or enter data manually.');
  }

  try {
    // Open-Meteo API (free, no API key required)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,rain&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=auto`;

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout: The weather API took too long to respond. Please check your internet connection and try again, or enter data manually.');
      }
      throw fetchError;
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Location not found. Please check farm coordinates.');
      } else if (response.status >= 500) {
        throw new Error(`Weather API server error (${response.status}). The service may be temporarily unavailable. Please try again later or enter data manually.`);
      } else {
        throw new Error(`Weather API error: ${response.status}. Please try again or enter data manually.`);
      }
    }

    const data: OpenMeteoResponse = await response.json();

    // Extract current and daily data
    const temperatureAvg = data.current.temperature_2m;
    const humidity = data.current.relative_humidity_2m;
    const temperatureMin = data.daily.temperature_2m_min[0];
    const temperatureMax = data.daily.temperature_2m_max[0];
    const rainfall = data.daily.rain_sum[0] || 0;

    // Get today's date in ISO format
    const recordDate = new Date().toISOString().substring(0, 10);

    return {
      temperatureMin: parseFloat(temperatureMin.toFixed(1)),
      temperatureMax: parseFloat(temperatureMax.toFixed(1)),
      temperatureAvg: parseFloat(temperatureAvg.toFixed(1)),
      humidity: Math.round(humidity),
      rainfall: parseFloat(rainfall.toFixed(1)),
      recordDate,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to fetch weather data. Please check your internet connection and try again, or enter data manually.');
  }
};

