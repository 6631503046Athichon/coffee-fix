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
  try {
    // Open-Meteo API (free, no API key required)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,rain&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Location not found. Please check farm coordinates.');
      } else {
        throw new Error(`Weather API error: ${response.status}`);
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
    throw new Error('Failed to fetch weather data. Please check your internet connection.');
  }
};

/**
 * Fetch average temperature and humidity over a date range using Open-Meteo archive API
 * Dates must be in YYYY-MM-DD format (ISO date without time)
 */
export const fetchWeatherAveragesForRange = async (
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
): Promise<{ avgTempC: number; avgHumidityPct: number } | null> => {
  try {
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean,relative_humidity_2m_mean&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const temps: number[] = data?.daily?.temperature_2m_mean || [];
    const humidities: number[] = data?.daily?.relative_humidity_2m_mean || [];
    if (!temps.length || !humidities.length) return null;
    const avgTempC = temps.reduce((a: number, b: number) => a + b, 0) / temps.length;
    const avgHumidityPct = humidities.reduce((a: number, b: number) => a + b, 0) / humidities.length;
    return { avgTempC, avgHumidityPct };
  } catch {
    return null;
  }
};
