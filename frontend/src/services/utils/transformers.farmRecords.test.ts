/**
 * Soil analysis, weather record and GAP log transformer tests: dates reach the
 * forms as YYYY-MM-DD, and soil nitrogen is never invented as 0.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  transformGAPLogFromBackend,
  transformSoilAnalysisFromBackend,
  transformSoilAnalysisToBackend,
  transformWeatherRecordFromBackend,
} from './transformers'

const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Asia/Bangkok'
  expect(new Date('2026-09-14T17:00:00.000Z').getDate()).toBe(15)
})
afterAll(() => {
  // Assigning undefined would set the string 'undefined' (read as UTC) for
  // the files that run after this one in the same worker.
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const backendSoil = (overrides: Record<string, unknown> = {}) => ({
  id: 'soil-1',
  farmId: 'farm-1',
  farmPlotLocation: 'Plot A',
  testDate: '2026-09-15T12:00:00.000Z',
  pH: 6.2,
  phosphorus: 12,
  potassium: 80,
  nitrogen: 0.18,
  calcium: 1200,
  magnesium: 150,
  createdAt: '2026-09-15T08:00:00.000Z',
  updatedAt: '2026-09-15T08:00:00.000Z',
  ...overrides,
})

// What the API client actually sends: undefined keys drop out.
const asSent = (payload: object) => JSON.parse(JSON.stringify(payload))

describe('dates from the backend become YYYY-MM-DD', () => {
  it('soil analysis testDate', () => {
    expect(transformSoilAnalysisFromBackend(backendSoil()).testDate).toBe('2026-09-15')
    // 00:00 in Bangkok is 17:00Z the day before.
    expect(
      transformSoilAnalysisFromBackend(backendSoil({ testDate: '2026-09-14T17:00:00.000Z' })).testDate,
    ).toBe('2026-09-15')
  })

  it('weather record recordDate', () => {
    const record = transformWeatherRecordFromBackend({
      id: 'w-1',
      farmId: 'farm-1',
      farmPlotLocation: 'Plot A',
      recordDate: '2026-09-15T12:00:00.000Z',
      temperatureMin: 18,
      temperatureMax: 27,
      temperatureAvg: 22,
      rainfall: 3,
      humidity: 80,
      source: 'Manual',
    })
    expect(record.recordDate).toBe('2026-09-15')
  })

  it('weather record stamped by the auto-fetch scheduler', () => {
    // The scheduler stamps Bangkok's today at 00:00 UTC (bangkokToday()),
    // also between 00:00 and 07:00 Thai time.
    const record = transformWeatherRecordFromBackend({
      id: 'w-2',
      recordDate: '2026-09-16T00:00:00.000Z',
    })
    expect(record.recordDate).toBe('2026-09-16')
  })

  it('GAP log date', () => {
    const log = transformGAPLogFromBackend({
      id: 'gap-1',
      farmId: 'farm-1',
      farmPlotLocation: 'Plot A',
      activityTypeName: 'Fertilizing',
      date: '2026-09-15T12:00:00.000Z',
      productUsed: 'Compost',
      quantity: '20 kg',
    })
    expect(log.date).toBe('2026-09-15')
  })

  it('leaves an already normalised date alone and blanks an unreadable one', () => {
    expect(transformSoilAnalysisFromBackend(backendSoil({ testDate: '2026-09-15' })).testDate).toBe('2026-09-15')
    expect(transformGAPLogFromBackend({ id: 'gap-2', date: 'not a date' }).date).toBe('')
  })
})

describe('transformSoilAnalysisToBackend nitrogen', () => {
  const formData = (nitrogen: unknown) => ({
    farmId: 'farm-1',
    farmPlotLocation: 'Plot A',
    testDate: '2026-09-15',
    pH: 6.2,
    phosphorus: 12,
    potassium: 80,
    nitrogen,
    calcium: 1200,
    magnesium: 150,
  })

  it('sends the nitrogen that was entered', () => {
    expect(asSent(transformSoilAnalysisToBackend(formData(0.15))).nitrogen).toBe('0.15')
    expect(asSent(transformSoilAnalysisToBackend(formData('0.085'))).nitrogen).toBe('0.085')
  })

  it('sends a real reading of 0', () => {
    expect(asSent(transformSoilAnalysisToBackend(formData(0))).nitrogen).toBe('0')
  })

  it('leaves nitrogen out, instead of sending 0, when there is none', () => {
    for (const blank of [undefined, null, '', Number.NaN]) {
      expect(asSent(transformSoilAnalysisToBackend(formData(blank)))).not.toHaveProperty('nitrogen')
    }
  })

  it('keeps nitrogen through a load-then-save round trip', () => {
    const loaded = transformSoilAnalysisFromBackend(backendSoil({ nitrogen: 0.18 }))
    expect(asSent(transformSoilAnalysisToBackend(loaded)).nitrogen).toBe('0.18')
  })
})
