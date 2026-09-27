import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ParchmentSourceType } from '../../../types'
import type { ParchmentLot } from '../../../types'
import ParchmentWithdrawModal from './ParchmentWithdrawModal'
import type { ParchmentWithdrawModalProps } from './ParchmentWithdrawModal'

const parchment: ParchmentLot = {
  id: 'pl-1', displayId: 'PL-2026-3', sourceType: ParchmentSourceType.Internal,
  initialWeightKg: 100, currentWeightKg: 100, moistureContent: 11,
  processType: 'Washed', status: 'AwaitingHulling',
}

const weight = (row: number) => screen.getByLabelText(`Weight (kg), row ${row}`)
const price = (row: number) => screen.getByLabelText(`Price per kg in THB (optional), row ${row}`)
const confirm = () => screen.getByText('Confirm Withdrawal', { selector: 'button' })

const renderHull = (
  onSubmit = vi.fn<ParchmentWithdrawModalProps['onSubmit']>(async () => {}),
) => {
  const { container } = render(
    <ParchmentWithdrawModal
      parchmentLot={parchment}
      users={[]}
      onSubmit={onSubmit}
      onCancel={() => {}}
      isSubmitting={false}
      initialWithdrawalType="HullAndGrade"
    />,
  )
  fireEvent.change(screen.getByPlaceholderText('0.0'), { target: { value: '100' } })
  fireEvent.change(screen.getByPlaceholderText('e.g., Order #123, Sample roast...'), {
    target: { value: 'Hull' },
  })
  return { onSubmit, container }
}

const pickGrade = (grade: string) => {
  fireEvent.click(screen.getAllByText('Select Grade').at(-1)!.closest('button')!)
  fireEvent.click(screen.getByText(grade, { selector: 'button' }))
}

describe('ParchmentWithdrawModal Hull price', () => {
  it('puts an optional THB price input directly after the weight', () => {
    const { container } = renderHull()
    const input = price(1)
    // Next control in tab order after the weight is the price.
    const controls = Array.from(container.querySelectorAll('input, button, select, textarea'))
    expect(controls[controls.indexOf(weight(1)) + 1]).toBe(input)
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveAttribute('placeholder', 'Optional')
    expect(input.parentElement).toHaveTextContent('THB')
    expect(screen.getByText('(optional)').parentElement).toHaveTextContent('Price / kg (optional)')
  })

  it('sends a typed price as gradedLots[i].price and leaves an empty one out', async () => {
    const { onSubmit } = renderHull()
    pickGrade('Grade A')
    fireEvent.change(weight(1), { target: { value: '60' } })
    fireEvent.change(price(1), { target: { value: '200' } })
    fireEvent.click(screen.getByText('Add Another Grade', { selector: 'button' }))
    pickGrade('Grade B')
    fireEvent.change(weight(2), { target: { value: '20' } })
    expect(screen.getByText('12,000.00 THB')).toHaveTextContent('12,000.00 THB value · 1 of 2 grades priced')
    fireEvent.click(confirm())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const sent = onSubmit.mock.calls[0][0]
    expect(sent.gradedLots![0]).toMatchObject({ grade: 'Grade A', weight: 60, price: 200 })
    expect(sent.gradedLots![1]).toMatchObject({ grade: 'Grade B', weight: 20 })
    expect(sent.gradedLots![1]).not.toHaveProperty('price')
  }, 15000)

  it('blocks the withdrawal for a price of 0, -1, abc or 1.234 and drops "Ready to confirm"', () => {
    const { onSubmit } = renderHull()
    pickGrade('Grade A')
    fireEvent.change(weight(1), { target: { value: '80' } })
    expect(confirm()).toBeEnabled()
    expect(screen.getByText('Ready to confirm.')).toBeInTheDocument()

    for (const [typed, message] of [
      ['0', 'Must be more than 0'],
      ['-1', 'Must be more than 0'],
      ['abc', 'Numbers only, e.g. 1200.50'],
      ['1.234', 'Max 2 decimals'],
    ]) {
      fireEvent.change(price(1), { target: { value: typed } })
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(confirm()).toBeDisabled()
      expect(screen.queryByText('Ready to confirm.')).not.toBeInTheDocument()
      fireEvent.click(confirm())
    }
    expect(onSubmit).not.toHaveBeenCalled()
  }, 15000)
})
