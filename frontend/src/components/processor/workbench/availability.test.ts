import { describe, expect, it } from 'vitest'
import {
  availabilityLabel,
  availabilityToggleTitle,
  hideNeedsConfirm,
  withdrawBlockedTitle,
} from './availability'

const onSale = { availabilityStatus: 'Available' as const, currentWeightKg: 40 }
const hidden = { availabilityStatus: 'Withdrawn' as const, currentWeightKg: 40 }
const empty = { availabilityStatus: 'Withdrawn' as const, currentWeightKg: 0 }

describe('green bean availability wording', () => {
  it('names the stored values On sale / Hidden, and an empty lot Depleted', () => {
    expect(availabilityLabel(onSale)).toBe('On sale')
    expect(availabilityLabel(hidden)).toBe('Hidden')
    expect(availabilityLabel(empty)).toBe('Depleted')
    expect(availabilityLabel({ ...onSale, currentWeightKg: 0 })).toBe('Depleted')
  })

  it('says what a click on the switch does', () => {
    expect(availabilityToggleTitle(onSale)).toBe('Hide this lot from sale')
    expect(availabilityToggleTitle(hidden)).toBe('Put this lot back on sale')
    expect(availabilityToggleTitle(empty)).toBe('No kg left to put on sale')
  })

  it('asks only before hiding a lot that still has kg', () => {
    expect(hideNeedsConfirm(onSale)).toBe(true)
    expect(hideNeedsConfirm(hidden)).toBe(false)
    expect(hideNeedsConfirm({ ...onSale, currentWeightKg: 0 })).toBe(false)
  })

  it('explains why Withdraw is off', () => {
    expect(withdrawBlockedTitle(onSale)).toBeUndefined()
    expect(withdrawBlockedTitle(hidden)).toBe('Hidden from sale: put the lot back on sale to withdraw')
    expect(withdrawBlockedTitle(empty)).toBe('No kg left to withdraw')
  })
})
