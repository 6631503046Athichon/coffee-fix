import { describe, expect, it } from 'vitest'
import {
  correctionErrorMessage,
  kgAlreadyOut,
  kgLeftAfter,
  lotWeightError,
  moistureError,
  sameKg,
} from './lotCorrections'

// F24: a correction re-weighs a lot. What already went out of it stays out,
// so the kg left moves with the weight and the weight never goes below it.

describe('kgAlreadyOut / kgLeftAfter', () => {
  it('is the weight minus the kg left, without float dust, and never negative', () => {
    expect(kgAlreadyOut({ initialWeightKg: 100, currentWeightKg: 60 })).toBe(40)
    expect(kgAlreadyOut({ initialWeightKg: 49.1, currentWeightKg: 30.2 })).toBe(18.9)
    expect(kgAlreadyOut({ initialWeightKg: 50, currentWeightKg: 60 })).toBe(0)
    expect(kgAlreadyOut({ initialWeightKg: undefined, currentWeightKg: 10 })).toBe(0)
  })

  it('moves the kg left by the same amount as the weight', () => {
    expect(kgLeftAfter({ initialWeightKg: 100, currentWeightKg: 60 }, 90)).toBe(50)
    expect(kgLeftAfter({ initialWeightKg: 100, currentWeightKg: 60 }, 40)).toBe(0)
  })
})

describe('lotWeightError', () => {
  it('refuses a blank, zero, negative or non-number weight', () => {
    for (const raw of ['', ' ', '0', '-5', 'abc']) {
      expect(lotWeightError(raw, 0)).toBe('Enter a weight greater than 0.')
    }
  })

  it('refuses a weight below what already went out, and accepts exactly that', () => {
    expect(lotWeightError('39.99', 40)).toMatch(/40\.00 kg of this lot already went out/)
    expect(lotWeightError('40', 40)).toBeNull()
  })

  it('caps parchment at the cherry it came from when a cap is given', () => {
    expect(lotWeightError('401', 0, 400)).toMatch(/cannot weigh more than the cherry lot .*400\.00 kg/)
    expect(lotWeightError('400', 0, 400)).toBeNull()
    expect(lotWeightError('401', 0)).toBeNull()
  })
})

describe('moistureError / sameKg / correctionErrorMessage', () => {
  it('accepts 0 to 100 only', () => {
    expect(moistureError('11.5')).toBeNull()
    expect(moistureError('0')).toBeNull()
    for (const raw of ['', '-1', '100.1', 'x']) expect(moistureError(raw)).not.toBeNull()
  })

  it('compares stored and typed kg to the gram', () => {
    expect(sameKg(80, Number('80.0'))).toBe(true)
    expect(sameKg(80, 80.5)).toBe(false)
    expect(sameKg(undefined, 80)).toBe(false)
  })

  it('turns a 403 into the permission sentence and keeps a 409 sentence as is', () => {
    expect(correctionErrorMessage(new Error('Forbidden'), 'Not yours.', 'Failed.')).toBe('Not yours.')
    expect(correctionErrorMessage(new Error('Insufficient permissions'), 'Not yours.', 'Failed.')).toBe('Not yours.')
    expect(correctionErrorMessage(new Error('40.00 kg already went out'), 'Not yours.', 'Failed.')).toBe('40.00 kg already went out')
    expect(correctionErrorMessage(null, 'Not yours.', 'Failed.')).toBe('Failed.')
  })
})
