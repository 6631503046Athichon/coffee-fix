import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { GreenBeanSourceType } from '../../../types'
import type { GreenBeanLot } from '../../../types'
import { updateGreenBeanLotPrice } from '../../../services/lots/greenBeanLotService'
import SetPriceModal from './SetPriceModal'

vi.mock('../../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../services/lots/greenBeanLotService')>(),
  updateGreenBeanLotPrice: vi.fn(),
}))

const lot: GreenBeanLot = {
  id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: GreenBeanSourceType.Internal,
  grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
  availabilityStatus: 'Available', cuppingScores: [],
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('SetPriceModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the lot, the live total, and saves price, currency and today as the effective date', async () => {
    const saved = { ...lot, pricePerKg: 150.5, currency: 'USD', priceSetDate: today(), priceSetBy: 'p-1' }
    vi.mocked(updateGreenBeanLotPrice).mockResolvedValue(saved)
    const onSaved = vi.fn()
    render(<SetPriceModal lot={lot} onClose={() => {}} onSaved={onSaved} />)

    expect(screen.getByRole('dialog', { name: 'Set price' })).toBeInTheDocument()
    expect(screen.getByText('Lot #GBL-2026-7 · Grade A')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Currency' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Effective date' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '150.5' } })
    expect(screen.getByText('6,020.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'THB' }))
    fireEvent.click(screen.getByRole('button', { name: 'USD' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(updateGreenBeanLotPrice).toHaveBeenCalledWith('gbl-1', {
      pricePerKg: 150.5, currency: 'USD', priceSetDate: today(),
    })
  })

  it.each(['', '0', '-3'])('refuses to save a price of %p', (value) => {
    render(<SetPriceModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))

    expect(screen.getByText('Enter a price greater than 0.')).toBeInTheDocument()
    expect(updateGreenBeanLotPrice).not.toHaveBeenCalled()
  })

  it('opens on the current price and currency when the lot already has one', () => {
    render(
      <SetPriceModal
        lot={{ ...lot, pricePerKg: 210, currency: 'EUR' }}
        onClose={() => {}}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Edit price' })).toBeInTheDocument()
    expect(screen.getByLabelText('Price per kg')).toHaveValue(210)
    expect(screen.getByRole('button', { name: 'EUR' })).toBeInTheDocument()
    expect(screen.getByText('210.00 EUR/kg')).toBeInTheDocument()
  })

  it('explains a permission refusal inline and reports it', async () => {
    // A 403 comes back as { error: 'Forbidden' }; the api client throws that text.
    vi.mocked(updateGreenBeanLotPrice).mockRejectedValue(new Error('Forbidden'))
    const onSaved = vi.fn()
    const onError = vi.fn()
    render(<SetPriceModal lot={lot} onClose={() => {}} onSaved={onSaved} onError={onError} />)

    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))

    const message = 'Only the processor who created this lot, or an admin, can set its price.'
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onError).toHaveBeenCalledWith(message)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
