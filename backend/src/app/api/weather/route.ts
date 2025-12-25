import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, handleApiError } from '@/lib/middleware'

// Open-Meteo API - Free, no API key required
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast'

interface WeatherData {
  latitude: number
  longitude: number
  current: {
    temperature: number
    humidity: number
    rainfall: number
    weatherCode: number
    windSpeed: number
  }
  daily: {
    date: string
    temperatureMax: number
    temperatureMin: number
    temperatureAvg: number
    rainfall: number
    humidity: number
    uvIndexMax: number
  }[]
}

// GET /api/weather?lat=xxx&lng=xxx&days=7
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const lat = request.nextUrl.searchParams.get('lat')
    const lng = request.nextUrl.searchParams.get('lng')
    const days = request.nextUrl.searchParams.get('days') || '7'

    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      )
    }

    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Invalid latitude or longitude' },
        { status: 400 }
      )
    }

    // Fetch weather data from Open-Meteo
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,uv_index_max',
      timezone: 'Asia/Bangkok',
      forecast_days: days,
    })

    const response = await fetch(`${OPEN_METEO_API}?${params}`)

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`)
    }

    const data = await response.json()

    // Transform data to our format
    const weatherData: WeatherData = {
      latitude: data.latitude,
      longitude: data.longitude,
      current: {
        temperature: data.current?.temperature_2m ?? 0,
        humidity: data.current?.relative_humidity_2m ?? 0,
        rainfall: data.current?.precipitation ?? 0,
        weatherCode: data.current?.weather_code ?? 0,
        windSpeed: data.current?.wind_speed_10m ?? 0,
      },
      daily: (data.daily?.time || []).map((date: string, i: number) => ({
        date,
        temperatureMax: data.daily?.temperature_2m_max?.[i] ?? 0,
        temperatureMin: data.daily?.temperature_2m_min?.[i] ?? 0,
        temperatureAvg: ((data.daily?.temperature_2m_max?.[i] ?? 0) + (data.daily?.temperature_2m_min?.[i] ?? 0)) / 2,
        rainfall: data.daily?.precipitation_sum?.[i] ?? 0,
        humidity: data.daily?.relative_humidity_2m_mean?.[i] ?? 0,
        uvIndexMax: data.daily?.uv_index_max?.[i] ?? 0,
      })),
    }

    return NextResponse.json({ weather: weatherData })
  } catch (error) {
    return handleApiError(error)
  }
}

// Weather code descriptions
export const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}
