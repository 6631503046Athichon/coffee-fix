import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toDateOnly, todayDateOnly } from './dateOnly';
import { transformGAPLogFromBackend, transformSoilAnalysisFromBackend, transformWeatherRecordFromBackend } from '../services/utils/transformers';
import { formatDateDisplay } from './formatters';

// Run a block in a given time zone. Restoring an unset TZ must delete it:
// assigning undefined would set the string 'undefined', which Node reads as
// UTC for every file that runs after this one in the same worker.
const inTimeZone = (zone: string, guard: () => void) => {
  const originalTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
    // If the runtime ignored the change, the cases would test another zone.
    guard();
  });
  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });
};

describe('in Thailand (UTC+7)', () => {
  inTimeZone('Asia/Bangkok', () => expect(new Date('2026-09-14T17:00:00.000Z').getDate()).toBe(15));

  describe('toDateOnly', () => {
    it('passes a plain YYYY-MM-DD through unchanged', () => {
      expect(toDateOnly('2026-09-15')).toBe('2026-09-15');
      expect(toDateOnly(' 2026-09-15 ')).toBe('2026-09-15');
    });

    it('reads an ISO datetime from the backend as its calendar day', () => {
      // Soil test dates sit at 12:00 UTC.
      expect(toDateOnly('2026-09-15T12:00:00.000Z')).toBe('2026-09-15');
      // GAP and weather dates sit at 00:00 UTC.
      expect(toDateOnly('2026-09-15T00:00:00.000Z')).toBe('2026-09-15');
    });

    it('uses the Thai day, not the UTC day, for a time near midnight', () => {
      // 17:00Z on the 14th is 00:00 on the 15th in Bangkok; slicing the ISO
      // string would give the 14th.
      expect(toDateOnly('2026-09-14T17:00:00.000Z')).toBe('2026-09-15');
      expect(toDateOnly('2026-09-15T00:30:00+07:00')).toBe('2026-09-15');
    });

    it('reads a Date object as its Thai calendar day', () => {
      expect(toDateOnly(new Date('2026-09-14T17:30:00.000Z'))).toBe('2026-09-15');
      expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('gives an empty string for anything that is not a real date', () => {
      expect(toDateOnly('')).toBe('');
      expect(toDateOnly(null)).toBe('');
      expect(toDateOnly(undefined)).toBe('');
      expect(toDateOnly('garbage')).toBe('');
      expect(toDateOnly('15/09/2026')).toBe('');
      expect(toDateOnly('2026-02-30')).toBe('');
      expect(toDateOnly('2026-13-01')).toBe('');
      expect(toDateOnly('2026-02-30T12:00:00.000Z')).toBe('');
      expect(toDateOnly('2026-09-15Tnot-a-time')).toBe('');
      expect(toDateOnly(new Date('nope'))).toBe('');
      expect(toDateOnly(1757894400000)).toBe('');
    });
  });

  describe('todayDateOnly', () => {
    it('is the Thai day before 07:00, when the UTC day is still yesterday', () => {
      // 06:30 on the 16th in Bangkok.
      const now = new Date('2026-09-15T23:30:00.000Z');
      expect(now.toISOString().substring(0, 10)).toBe('2026-09-15');
      expect(todayDateOnly(0, now)).toBe('2026-09-16');
    });

    it('counts days back on the calendar', () => {
      const now = new Date('2026-09-15T23:30:00.000Z');
      expect(todayDateOnly(29, now)).toBe('2026-08-18');
      expect(todayDateOnly(6, new Date('2026-03-02T05:00:00.000Z'))).toBe('2026-02-24');
    });
  });
});

describe('west of UTC (New York, UTC-4 in September)', () => {
  inTimeZone('America/New_York', () => expect(new Date('2026-09-15T00:00:00.000Z').getDate()).toBe(14));

  it('a GAP or weather date at 00:00 UTC keeps its day', () => {
    expect(toDateOnly('2026-09-15T00:00:00.000Z')).toBe('2026-09-15');
    expect(transformGAPLogFromBackend({ id: 'g-1', date: '2026-09-15T00:00:00.000Z' }).date).toBe('2026-09-15');
    // What the weather scheduler stamps: Bangkok's today at 00:00 UTC.
    expect(transformWeatherRecordFromBackend({ id: 'w-1', recordDate: '2026-09-16T00:00:00.000Z' }).recordDate)
      .toBe('2026-09-16');
  });

  it('a soil date at 12:00 UTC keeps its day', () => {
    expect(transformSoilAnalysisFromBackend({ id: 's-1', testDate: '2026-09-15T12:00:00.000Z' }).testDate)
      .toBe('2026-09-15');
  });

  it('a loaded date is shown on its own day, not the day before', () => {
    const day = toDateOnly('2026-09-15T00:00:00.000Z');
    expect(formatDateDisplay(day, { year: 'numeric', month: '2-digit', day: '2-digit' }, '', 'en-CA')).toBe('2026-09-15');
  });

  it('todayDateOnly is the viewer\'s own calendar day', () => {
    // 22:00 on the 15th in New York (already the 16th in UTC).
    expect(todayDateOnly(0, new Date('2026-09-16T02:00:00.000Z'))).toBe('2026-09-15');
  });
});

describe('far east of Thailand (Auckland, UTC+12)', () => {
  inTimeZone('Pacific/Auckland', () => expect(new Date('2026-09-15T12:00:00.000Z').getDate()).toBe(16));

  it('a soil date at 12:00 UTC keeps its day', () => {
    expect(toDateOnly('2026-09-15T12:00:00.000Z')).toBe('2026-09-15');
  });
});
