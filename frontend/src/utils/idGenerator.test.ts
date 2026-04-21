import { describe, test, expect } from 'vitest'
import {
  generateNextId,
  extractIdNumber,
  generateHarvestLotId,
  generateParchmentLotId,
  generateGreenBeanLotId,
} from './idGenerator'

describe('generateNextId', () => {
  test('returns {prefix}001 when no existing ids', () => {
    expect(generateNextId([], 'HL', 3)).toBe('HL001')
  })

  test('increments the max numeric suffix across existing ids', () => {
    expect(generateNextId(['HL001', 'HL005', 'HL003'], 'HL', 3)).toBe('HL006')
  })

  test('pads to the requested width', () => {
    expect(generateNextId(['HL099'], 'HL', 3)).toBe('HL100')
    expect(generateNextId(['GB9'], 'GB', 5)).toBe('GB00010')
  })

  test('ignores ids that do not match the prefix or are non-numeric', () => {
    // Parser strips the prefix then parseInts the remainder. "XY999" -> "XY999" -> NaN -> filtered.
    expect(generateNextId(['HL001', 'XY999', 'HL-invalid'], 'HL', 3)).toBe('HL002')
  })

  test('handles ids that happen to skip values', () => {
    expect(generateNextId(['HL010', 'HL020'], 'HL', 3)).toBe('HL021')
  })
})

describe('extractIdNumber', () => {
  test('strips prefix and parses the numeric suffix', () => {
    expect(extractIdNumber('HL042', 'HL')).toBe(42)
  })

  test('returns NaN for ids whose suffix is non-numeric', () => {
    expect(Number.isNaN(extractIdNumber('HL-invalid', 'HL'))).toBe(true)
  })
})

describe('prefix helpers', () => {
  test('each helper uses its documented prefix', () => {
    expect(generateHarvestLotId([])).toBe('HL001')
    expect(generateParchmentLotId([])).toBe('PL001')
    expect(generateGreenBeanLotId([])).toBe('GB001')
  })
})
