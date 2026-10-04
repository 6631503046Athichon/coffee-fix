import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ParchmentSourceType } from '../../../types'
import type { ParchmentLot } from '../../../types'
import { api } from '../../../services/api'
import { ApiError } from '../../../services/apiError'
import EditParchmentLotModal from './EditParchmentLotModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// F24: correcting a parchment lot that is not a batch's only output. Its
// whole weight (initialWeightKg) and moisture go to PATCH
// /parchment-lots/:id; the kg left and the status follow on the backend.

const lot: ParchmentLot = {
  id: 'pl-ext', displayId: 'PCH-2026-31', sourceType: ParchmentSourceType.External,
  externalSource: {
    code: 'EXT-7', variety: 'Typica', origin: 'Nan', importDate: '2026-09-01',
    importedBy: 'admin', fileName: 'import.xlsx',
  },
  initialWeightKg: 200, currentWeightKg: 150, moistureContent: 12,
  processType: 'Natural', status: 'AwaitingHulling',
}

const backendLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'pl-ext', displayId: 'PCH-2026-31', sourceType: 'External', initialWeightKg: 200,
  currentWeightKg: 150, moistureContent: 12, processType: 'Natural', status: 'AwaitingHulling',
  ...overrides,
})

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

describe('EditParchmentLotModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the lot weight and moisture, with what already went out', () => {
    render(<EditParchmentLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Edit parchment lot' })).toBeInTheDocument()
    expect(screen.getByText('PCH-2026-31')).toBeInTheDocument()
    expect(screen.getByText('External EXT-7')).toBeInTheDocument()
    expect(screen.getByLabelText('Lot weight (kg)')).toHaveValue(200)
    expect(screen.getByLabelText('Moisture (%)')).toHaveValue(12)
    expect(screen.getByTestId('edit-parchment-stock')).toHaveTextContent(
      '50.00 kg already withdrawn or hulled, so the weight cannot go below that. 150.00 kg left in stock after saving.',
    )
  })

  it('sends the whole weight and moisture only, never the kg left or the status', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      parchmentLot: backendLot({ initialWeightKg: 180, currentWeightKg: 130, moistureContent: 11.5 }),
    })
    const onSaved = vi.fn()
    render(<EditParchmentLotModal lot={lot} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value: '180' } })
    expect(screen.getByTestId('edit-parchment-stock')).toHaveTextContent('130.00 kg left in stock after saving.')
    fireEvent.change(screen.getByLabelText('Moisture (%)'), { target: { value: '11.5' } })
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/parchment-lots/pl-ext', { initialWeightKg: 180, moistureContent: 11.5 })
    expect(onSaved.mock.calls[0][0]).toMatchObject({ id: 'pl-ext', initialWeightKg: 180, currentWeightKg: 130 })
  })

  it('refuses a weight below what already went out, and a moisture over 100, without sending', () => {
    render(<EditParchmentLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value: '49' } })
    fireEvent.change(screen.getByLabelText('Moisture (%)'), { target: { value: '101' } })
    save()

    expect(screen.getByText(/50\.00 kg of this lot already went out/)).toBeInTheDocument()
    expect(screen.getByText('Enter a moisture between 0 and 100%.')).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('shows the backend 409 when the lot changed while the popup was open', async () => {
    const changed = 'This lot changed while you were editing it, so nothing was saved. Reload and try again.'
    vi.mocked(api.patch).mockRejectedValue(new ApiError(changed, 409, { error: changed }))
    const onError = vi.fn()
    render(<EditParchmentLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} onError={onError} />)

    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value: '190' } })
    save()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(changed))
    expect(screen.getByRole('alert')).toHaveTextContent(changed)
  })
})
