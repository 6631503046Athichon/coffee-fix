import {
  toRoaId,
  toFixed2,
  formatDecimal,
  clamp,
  formatPercentage,
  parseNumber,
  formatDateDisplay,
} from './formatters'

describe('toRoaId', () => {
  test('derives a stable ROA-XXXX id from a UUID', () => {
    // Deterministic: the same UUID must always produce the same ROA id.
    const uuid = '12345678-abcd-ef00-0000-000000000000'
    expect(toRoaId(uuid)).toBe(toRoaId(uuid))
  })

  test('produces the ROA-XXXX format padded to 4 digits', () => {
    expect(toRoaId('00000001-0000-0000-0000-000000000000')).toMatch(/^ROA-\d{4}$/)
  })

  test('keeps numbers below 10000 by mod 10000', () => {
    // Highest possible u32 value from first 8 hex chars -> still must land under 10000.
    const maxUuid = 'ffffffff-0000-0000-0000-000000000000'
    const id = toRoaId(maxUuid)
    const num = parseInt(id.replace('ROA-', ''), 10)
    expect(num).toBeGreaterThanOrEqual(0)
    expect(num).toBeLessThan(10000)
  })
})

describe('toFixed2', () => {
  test('rounds to 2 decimal places and returns a number', () => {
    expect(toFixed2(3.14159)).toBe(3.14)
    // Avoid 1.005 — it's stored as 1.00499... in IEEE 754 and rounds DOWN, not up.
    // Use 1.016 which rounds cleanly with toFixed(2) → "1.02".
    expect(toFixed2(1.016)).toBe(1.02)
    expect(toFixed2(10)).toBe(10)
  })
})

describe('formatDecimal', () => {
  test('defaults to 2 decimals', () => {
    expect(formatDecimal(3.14159)).toBe('3.14')
  })

  test('honours a custom decimals argument', () => {
    expect(formatDecimal(3.14159, 4)).toBe('3.1416')
    expect(formatDecimal(3.14159, 0)).toBe('3')
  })
})

describe('clamp', () => {
  test('returns value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  test('clamps to min when below', () => {
    expect(clamp(-3, 0, 10)).toBe(0)
  })

  test('clamps to max when above', () => {
    expect(clamp(42, 0, 10)).toBe(10)
  })
})

describe('formatPercentage', () => {
  test('multiplies by 100 and appends %', () => {
    expect(formatPercentage(0.5)).toBe('50.0%')
    expect(formatPercentage(0.1234)).toBe('12.3%')
  })

  test('honours the decimals argument', () => {
    expect(formatPercentage(0.1234, 2)).toBe('12.34%')
    expect(formatPercentage(0.5, 0)).toBe('50%')
  })
})

describe('parseNumber', () => {
  test('parses valid numeric strings', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber('3.14')).toBe(3.14)
  })

  test('returns 0 for unparseable strings instead of NaN', () => {
    // The UI assumes parseNumber never produces NaN, otherwise sums silently break.
    expect(parseNumber('not-a-number')).toBe(0)
    expect(parseNumber('')).toBe(0)
  })
})

describe('formatDateDisplay', () => {
  test('returns empty string for missing input', () => {
    expect(formatDateDisplay(undefined)).toBe('')
  })

  test('returns the fallback when the date cannot be parsed', () => {
    expect(formatDateDisplay('not-a-date')).toBe('')
    expect(formatDateDisplay('not-a-date', undefined, 'N/A')).toBe('N/A')
  })

  test('formats a valid ISO date into a locale string', () => {
    // Don't assert the exact locale output (environment-dependent); just assert
    // it's non-empty and does not return the raw ISO string.
    const out = formatDateDisplay('2025-06-15T10:00:00Z')
    expect(out).not.toBe('')
    expect(out).not.toBe('2025-06-15T10:00:00Z')
  })
})
