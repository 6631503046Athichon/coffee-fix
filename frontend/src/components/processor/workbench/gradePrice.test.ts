import { describe, expect, it } from 'vitest'
import {
  formatBaht,
  gradePriceError,
  gradePriceLabel,
  gradeSplitValue,
  hasGradePriceError,
  parseGradePrice,
} from './gradePrice'

describe('grade split price', () => {
  it.each(['', '  ', '250', '250.5', '250.50', '.5', '0.01', ' 180 ', '1,200', '12,500.50'])(
    'accepts %p',
    (raw) => {
      expect(gradePriceError(raw)).toBeNull()
    },
  )

  it.each([
    ['0', 'Must be more than 0'],
    ['0.00', 'Must be more than 0'],
    ['-1', 'Must be more than 0'],
    ['abc', 'Numbers only, e.g. 1200.50'],
    ['150abc', 'Numbers only, e.g. 1200.50'],
    ['1e3', 'Numbers only, e.g. 1200.50'],
    // A comma that is not a thousands separator is not guessed at.
    ['12,50', 'Numbers only, e.g. 1200.50'],
    ['1,2000', 'Numbers only, e.g. 1200.50'],
    ['.', 'Numbers only, e.g. 1200.50'],
    ['1.234', 'Max 2 decimals'],
    ['1,200.555', 'Max 2 decimals'],
  ])('refuses %p with %p', (raw, message) => {
    expect(gradePriceError(raw)).toBe(message)
  })

  it('parses a valid price and leaves an empty or invalid one out', () => {
    expect(parseGradePrice('250.5')).toBe(250.5)
    expect(parseGradePrice(' 180 ')).toBe(180)
    expect(parseGradePrice('12,500.50')).toBe(12500.5)
    expect(parseGradePrice('')).toBeUndefined()
    expect(parseGradePrice('abc')).toBeUndefined()
    expect(parseGradePrice('0')).toBeUndefined()
  })

  it('flags a form with any refused price', () => {
    expect(hasGradePriceError([{ price: '' }, { price: '200' }])).toBe(false)
    expect(hasGradePriceError([{ price: '' }, { price: '1.234' }])).toBe(true)
  })

  it('values the priced rows, counts how many weighed rows are priced, and stays null until one row has both', () => {
    expect(gradeSplitValue([{ weight: '50', price: '' }])).toBeNull()
    expect(gradeSplitValue([{ weight: '50', price: 'abc' }])).toBeNull()
    // A price typed before any weight gives no "0.00 THB value".
    expect(gradeSplitValue([{ weight: '', price: '100' }])).toBeNull()
    expect(
      gradeSplitValue([
        { weight: '50', price: '250' },
        { weight: '20', price: '' },
        { weight: '', price: '100' },
      ]),
    ).toEqual({ value: 12500, pricedRows: 1, weighedRows: 2 })
  })

  it('formats the value as THB with two decimals, like the lot cards', () => {
    expect(formatBaht(12500)).toBe('12,500.00 THB')
    expect(formatBaht(12500.5)).toBe('12,500.50 THB')
    expect(formatBaht(13230)).toBe('13,230.00 THB')
  })

  it('names the input with its unit, that it is optional, and its row', () => {
    expect(gradePriceLabel(2)).toBe('Price per kg in THB (optional), row 2')
  })
})
