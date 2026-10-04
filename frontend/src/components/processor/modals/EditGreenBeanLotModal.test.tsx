import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { GreenBeanSourceType, ParchmentSourceType } from '../../../types'
import type { GreenBeanLot, ParchmentLot } from '../../../types'
import { api } from '../../../services/api'
import { ApiError } from '../../../services/apiError'
import EditGreenBeanLotModal from './EditGreenBeanLotModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// F24: correcting a green-bean lot's grade or whole weight through PUT
// /green-bean-lots/:id. The kg left moves with the weight; never below what
// was already withdrawn, sent to a roaster or sold.

const parchment: ParchmentLot = {
  id: 'pl-1', displayId: 'PCH-2026-9', sourceType: ParchmentSourceType.Internal,
  initialWeightKg: 100, currentWeightKg: 0, moistureContent: 11, processType: 'Washed', status: 'Hulled',
}

const lot: GreenBeanLot = {
  id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'pl-1',
  createdById: 'processor', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 30,
  availabilityStatus: 'Available', cuppingScores: [],
}

const backendLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: 'Internal', parchmentLotId: 'pl-1',
  createdById: 'processor', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 30,
  availabilityStatus: 'Available', withdrawalHistory: [],
  ...overrides,
})

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

describe('EditGreenBeanLotModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the grade and whole weight, with what already went out', () => {
    render(<EditGreenBeanLotModal lot={lot} parchmentLot={parchment} onClose={() => {}} onSaved={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Edit green bean lot' })).toBeInTheDocument()
    expect(screen.getByText('GBL-2026-7')).toBeInTheDocument()
    expect(screen.getByText('PCH-2026-9')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Grade' })).toHaveTextContent('Grade A')
    expect(screen.getByLabelText('Lot weight (kg)')).toHaveValue(50)
    expect(screen.getByTestId('edit-green-bean-stock')).toHaveTextContent(
      '20.00 kg already withdrawn, sent to a roaster or sold, so the weight cannot go below that. 30.00 kg left in stock after saving.',
    )
  })

  it('sends the picked grade and the whole weight, never the kg left', async () => {
    vi.mocked(api.put).mockResolvedValue({
      greenBeanLot: backendLot({ grade: 'Grade B', initialWeightKg: 45, currentWeightKg: 25 }),
    })
    const onSaved = vi.fn()
    render(<EditGreenBeanLotModal lot={lot} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: /Grade A/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Grade B' }))
    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value: '45' } })
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/green-bean-lots/gbl-1', { grade: 'Grade B', initialWeightKg: 45 })
    expect(onSaved.mock.calls[0][0]).toMatchObject({ grade: 'Grade B', initialWeightKg: 45, currentWeightKg: 25 })
  })

  it('refuses a weight below what already went out without sending', () => {
    render(<EditGreenBeanLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value: '19.99' } })
    save()

    expect(screen.getByText(/20\.00 kg of this lot already went out/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('shows the backend 409 sentence, and a permission sentence for a 403', async () => {
    const conflict = '20.00 kg of this green bean lot has already been withdrawn, hulled or sold, so its weight cannot go below 20.00 kg'
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError(conflict, 409, { error: conflict }))
    const onError = vi.fn()
    render(<EditGreenBeanLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} onError={onError} />)

    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value: '21' } })
    save()
    await waitFor(() => expect(onError).toHaveBeenCalledWith(conflict))
    expect(screen.getByRole('alert')).toHaveTextContent(conflict)

    vi.mocked(api.put).mockRejectedValueOnce(new Error('Forbidden'))
    save()
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith(
      'Only the processor who created this lot, or an admin, can edit it.',
    ))
  })
})
