import prisma from './prisma'

// ─────────────────────────────────────────────────────────────────────
// Server-side weather auto-fetch scheduler.
//
// Replaces the old browser-side loop (frontend weatherAutoFetchService),
// which only ran while someone had the app open — so records appeared at
// whatever random times users happened to visit, and two open tabs meant
// two writers racing each other. Running on the long-lived Railway server
// instead gives:
//   - on-time records 24/7, exactly every `weatherAutoFetchInterval` min
//   - a single writer, so no duplicate rows
//   - the (farmId, fetchSlot) unique constraint as a DB-level backstop in
//     case more than one server instance ever runs (e.g. local dev pointed
//     at the same database)
//
// Started once per process from src/instrumentation.ts. Set
// WEATHER_SCHEDULER_DISABLED=true to opt out (useful for local dev against
// the production database).
// ─────────────────────────────────────────────────────────────────────

const TICK_MS = 60_000
// Fire when we're within this margin of the interval boundary, so a 60s
// tick grid doesn't make every fetch drift one tick later each cycle
// (e.g. 5min interval checked at 4m59s should fire, not wait for 5m59s).
const TOLERANCE_MS = 5_000
const OPEN_METEO_TIMEOUT_MS = 10_000

interface OpenMeteoReading {
  temperatureMin: number
  temperatureMax: number
  temperatureAvg: number
  humidity: number
  rainfall: number
}

async function fetchOpenMeteo(
  latitude: number,
  longitude: number,
): Promise<OpenMeteoReading | null> {
  // Same fields the frontend manual "ดึงจาก API" button uses, so server
  // rows are indistinguishable from manually fetched ones.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,rain` +
    `&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=auto`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      console.error(`[WeatherScheduler] Open-Meteo HTTP ${res.status} for (${latitude}, ${longitude})`)
      return null
    }
    const data = await res.json()
    const temperatureMin = data?.daily?.temperature_2m_min?.[0]
    const temperatureMax = data?.daily?.temperature_2m_max?.[0]
    if (typeof temperatureMin !== 'number' || typeof temperatureMax !== 'number') {
      console.error('[WeatherScheduler] Open-Meteo response missing daily temperatures')
      return null
    }
    return {
      temperatureMin: round1(temperatureMin),
      temperatureMax: round1(temperatureMax),
      // Matches the legacy browser auto-fetch: avg = (min+max)/2 — the
      // history table renders it as the "(28)" figure next to the range.
      temperatureAvg: round1((temperatureMin + temperatureMax) / 2),
      humidity: Math.round(data?.current?.relative_humidity_2m ?? 70),
      rainfall: round1(data?.daily?.rain_sum?.[0] ?? 0),
    }
  } catch (e) {
    console.error('[WeatherScheduler] Open-Meteo fetch failed:', e)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

// Farms are Thai; record dates in the app are Thai calendar days. The
// server may run in UTC, so shift by +7h before taking the date part —
// otherwise records written between midnight and 7am Bangkok time would
// land on yesterday's date.
function bangkokToday(): Date {
  const bkk = new Date(Date.now() + 7 * 3600_000)
  return new Date(bkk.toISOString().substring(0, 10))
}

async function fetchFarmIfDue(farm: {
  id: string
  farmName: string | null
  location: string
  latitude: number | null
  longitude: number | null
  weatherAutoFetchInterval: number
}): Promise<'saved' | 'skipped' | 'no-reading'> {
  if (farm.latitude == null || farm.longitude == null) return 'skipped'
  const intervalMs = Math.max(1, farm.weatherAutoFetchInterval || 5) * 60_000

  const last = await prisma.weatherRecord.findFirst({
    where: { farmId: farm.id, source: 'API' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const now = Date.now()
  if (last && now - last.createdAt.getTime() < intervalMs - TOLERANCE_MS) {
    return 'skipped' // not due yet
  }

  const reading = await fetchOpenMeteo(farm.latitude, farm.longitude)
  if (!reading) return 'no-reading'

  // Minute-truncated slot; unique (farmId, fetchSlot) turns any race into
  // a no-op insert instead of a duplicate row.
  const fetchSlot = new Date(Math.floor(now / 60_000) * 60_000)
  try {
    await prisma.weatherRecord.create({
      data: {
        farmId: farm.id,
        farmPlotLocation: farm.location,
        recordDate: bangkokToday(),
        temperatureMin: reading.temperatureMin,
        temperatureMax: reading.temperatureMax,
        temperatureAvg: reading.temperatureAvg,
        rainfall: reading.rainfall,
        humidity: reading.humidity,
        source: 'API',
        fetchSlot,
        notes: `ดึงข้อมูลอัตโนมัติจาก Open-Meteo API เมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
      },
    })
    console.log(`[WeatherScheduler] saved record for ${farm.farmName ?? farm.id}`)
    return 'saved'
  } catch (e: unknown) {
    // P2002 = another writer already owns this minute's slot — exactly the
    // duplicate we want to suppress, so swallow it.
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      console.log(`[WeatherScheduler] slot already taken for ${farm.farmName ?? farm.id} — skipped duplicate`)
      return 'skipped'
    }
    throw e
  }
}

export interface WeatherSweepResult {
  farmsChecked: number
  saved: number
  /** already had a fresh enough record, or no coordinates */
  skipped: number
  /** Open-Meteo returned nothing usable */
  noReading: number
  failed: number
}

/**
 * One pass over every auto-fetch farm.
 *
 * Safe to call as often as you like: fetchFarmIfDue() only writes when that
 * farm's own interval has elapsed, so an over-eager caller costs one cheap
 * lookup per farm and nothing more. Driven by setInterval on a long-lived
 * server, or by api/cron/weather when running somewhere without one.
 */
export async function runWeatherSweep(): Promise<WeatherSweepResult> {
  const farms = await prisma.farm.findMany({
    where: {
      weatherAutoFetchEnabled: true,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      farmName: true,
      location: true,
      latitude: true,
      longitude: true,
      weatherAutoFetchInterval: true,
    },
  })
  let saved = 0
  let skipped = 0
  let noReading = 0
  let failed = 0
  for (const farm of farms) {
    try {
      const outcome = await fetchFarmIfDue(farm)
      if (outcome === 'saved') saved++
      else if (outcome === 'skipped') skipped++
      else noReading++
    } catch (e) {
      // One farm failing must not stop the rest.
      failed++
      console.error(`[WeatherScheduler] farm ${farm.id} failed:`, e)
    }
  }
  return { farmsChecked: farms.length, saved, skipped, noReading, failed }
}

// globalThis guard so Next dev-mode HMR / repeated register() calls never
// stack a second interval in the same process.
const globalScheduler = globalThis as unknown as {
  __weatherSchedulerStarted?: boolean
}

export function startWeatherScheduler(): void {
  if (globalScheduler.__weatherSchedulerStarted) return
  // Serverless has no process to keep a timer alive: the instance that set
  // the interval is frozen or discarded between requests, and every cold
  // start would fire a fresh sweep. Let api/cron/weather drive it there.
  if (process.env.VERCEL) {
    console.log('[WeatherScheduler] serverless detected — driven by api/cron/weather instead')
    return
  }
  if (process.env.WEATHER_SCHEDULER_DISABLED === 'true') {
    console.log('[WeatherScheduler] disabled via WEATHER_SCHEDULER_DISABLED')
    return
  }
  globalScheduler.__weatherSchedulerStarted = true

  console.log('[WeatherScheduler] started — checking farms every 60s')
  setInterval(() => {
    runWeatherSweep().catch((e) => console.error('[WeatherScheduler] tick failed:', e))
  }, TICK_MS)
  // First pass shortly after boot so a fresh deploy resumes collection
  // immediately instead of waiting a full tick.
  setTimeout(() => {
    runWeatherSweep().catch((e) => console.error('[WeatherScheduler] initial tick failed:', e))
  }, 5_000)
}
