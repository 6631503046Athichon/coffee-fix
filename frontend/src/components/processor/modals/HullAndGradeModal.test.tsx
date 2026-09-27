import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ParchmentSourceType } from '../../../types'
import type { ParchmentLot } from '../../../types'
import HullAndGradeModal from './HullAndGradeModal'

const parchment: ParchmentLot = {
  id: 'pl-1', sourceType: ParchmentSourceType.Internal,
  initialWeightKg: 100, currentWeightKg: 100, moistureContent: 11,
  processType: 'Washed', status: 'AwaitingHulling',
}

type Row = { grade: string; weight: string; price: string; score: string }

const price = (row: number) => screen.getByLabelText(`Price per kg in THB (optional), row ${row}`)

const renderModal = (gradedLots: Row[], onGradedLotsChange = vi.fn()) => {
  const { container } = render(
    <HullAndGradeModal
      parchment={parchment}
      totalGreenWeight="80"
      onTotalGreenWeightChange={() => {}}
      gradedLots={gradedLots}
      onGradedLotsChange={onGradedLotsChange}
      gradedWeightSum={80}
    />,
  )
  return { onChange: onGradedLotsChange, container }
}

describe('HullAndGradeModal price', () => {
  it('puts the optional THB price input directly after the weight and passes a typed price up', () => {
    const { onChange, container } = renderModal([{ grade: 'Grade A', weight: '80', price: '', score: '' }])
    const input = price(1)
    // Next control in tab order after the weight is the price.
    const controls = Array.from(container.querySelectorAll('input, button, select, textarea'))
    expect(controls[controls.indexOf(screen.getByLabelText('Weight (kg), row 1')) + 1]).toBe(input)
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveAttribute('placeholder', 'Optional')
    expect(input.parentElement).toHaveTextContent('THB')
    expect(screen.getByText('(optional)').parentElement).toHaveTextContent('Price / kg (optional)')

    fireEvent.change(input, { target: { value: '250' } })
    expect(onChange).toHaveBeenCalledWith([
      { grade: 'Grade A', weight: '80', price: '250', score: '' },
    ])
  })

  it('shows the value of the priced rows and how many are priced', () => {
    renderModal([
      { grade: 'Grade A', weight: '50', price: '250', score: '' },
      { grade: 'Grade B', weight: '30', price: '', score: '' },
    ])
    expect(screen.getByText('12,500.00 THB', { exact: false })).toHaveTextContent(
      '12,500.00 THB value · 1 of 2 grades priced',
    )
  })

  it.each([
    ['0', 'Must be more than 0'],
    ['abc', 'Numbers only, e.g. 1200.50'],
    ['1.234', 'Max 2 decimals'],
  ])('flags a price of %p', (typed, message) => {
    renderModal([{ grade: 'Grade A', weight: '80', price: typed, score: '' }])
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(price(1)).toHaveAttribute('aria-invalid', 'true')
  })
})
