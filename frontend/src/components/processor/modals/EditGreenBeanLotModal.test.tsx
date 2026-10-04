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

// The green bean lots one Hull & Grade made never weigh more than the
// parchment it hulled. On prod PCH-2026-5 (16 kg) was hulled into GBL-2026-6
// (8 kg) and GBL-2026-7 (4 kg), and GBL-2026-7 could be edited to 9 kg.
describe('EditGreenBeanLotModal: the Hull & Grade limit', () => {
  beforeEach(() => vi.clearAllMocks())

  const HULLED_AT = '2026-09-20T03:00:00.000Z'
  const hulledParchment: ParchmentLot = {
    id: 'pl-5', displayId: 'PCH-2026-5', sourceType: ParchmentSourceType.Internal,
    initialWeightKg: 16, currentWeightKg: 0, moistureContent: 11, processType: 'Washed', status: 'Hulled',
    withdrawalHistory: [
      { id: 'pw-hull', amountKg: 16, withdrawalType: 'HullAndGrade', purpose: 'Hull', date: HULLED_AT },
      // A voided Hull & Grade no longer counts.
      { id: 'pw-void', amountKg: 30, withdrawalType: 'HullAndGrade', purpose: 'Hull', date: '2026-09-10T03:00:00.000Z', voidedAt: '2026-09-11T03:00:00.000Z' },
      { id: 'pw-sale', amountKg: 2, withdrawalType: 'Sale', purpose: 'Sale', date: HULLED_AT },
    ],
  }
  const greenLot = (id: string, kg: number, extra: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
    id, displayId: id.toUpperCase(), sourceType: GreenBeanSourceType.Internal, parchmentLotId: 'pl-5',
    parchmentWithdrawalId: 'pw-hull', createdById: 'processor', grade: 'Grade A',
    initialWeightKg: kg, currentWeightKg: kg, availabilityStatus: 'Available', cuppingScores: [],
    createdAt: '2026-09-20T03:00:01.000Z', ...extra,
  })
  const gbl6 = greenLot('gbl-2026-6', 8)
  const gbl7 = greenLot('gbl-2026-7', 4)
  const renderHull = (lotToEdit: GreenBeanLot, lots: GreenBeanLot[], onSaved = vi.fn()) =>
    render(
      <EditGreenBeanLotModal
        lot={lotToEdit} parchmentLot={hulledParchment} greenBeanLots={lots}
        onClose={() => {}} onSaved={onSaved}
      />,
    )
  const weightTo = (value: string) =>
    fireEvent.change(screen.getByLabelText('Lot weight (kg)'), { target: { value } })

  it('shows the limit before saving and refuses the prod case (4 kg -> 9 kg) without sending', () => {
    renderHull(gbl7, [gbl6, gbl7])

    const limit = screen.getByTestId('edit-green-bean-hull-limit')
    expect(limit).toHaveTextContent(
      'At most 8.00 kg: its Hull & Grade hulled 16.00 kg of parchment and the other green bean lots weigh 8.00 kg.',
    )
    expect(limit).not.toHaveClass('text-red-600')

    weightTo('9')
    expect(limit).toHaveClass('text-red-600')
    save()

    expect(screen.getByText(/Green beans cannot weigh more than the parchment they were hulled from\. At most 8\.00 kg/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('sends a weight up to the limit', async () => {
    vi.mocked(api.put).mockResolvedValue({ greenBeanLot: backendLot({ id: 'gbl-2026-7', initialWeightKg: 8 }) })
    const onSaved = vi.fn()
    renderHull(gbl7, [gbl6, gbl7], onSaved)

    weightTo('8')
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/green-bean-lots/gbl-2026-7', { initialWeightKg: 8 })
  })

  it('always lets an over-weight lot come down, even when still over', async () => {
    vi.mocked(api.put).mockResolvedValue({ greenBeanLot: backendLot({ id: 'gbl-2026-7', initialWeightKg: 8.5 }) })
    const onSaved = vi.fn()
    // What prod holds now: 8 + 9 kg from 16 kg of parchment.
    const over = greenLot('gbl-2026-7', 9)
    renderHull(over, [gbl6, over], onSaved)

    weightTo('8.5')
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/green-bean-lots/gbl-2026-7', { initialWeightKg: 8.5 })
  })

  it('matches an older lot (no Hull & Grade link) to the Hull & Grade recorded with it', () => {
    const old6 = greenLot('gbl-2026-6', 8, { parchmentWithdrawalId: undefined })
    const old7 = greenLot('gbl-2026-7', 4, { parchmentWithdrawalId: undefined })
    renderHull(old7, [old6, old7])

    expect(screen.getByTestId('edit-green-bean-hull-limit')).toHaveTextContent(
      'At most 8.00 kg: its Hull & Grade hulled 16.00 kg of parchment and the other green bean lots weigh 8.00 kg.',
    )
  })

  it('shows no limit for a lot no Hull & Grade made', () => {
    const external = greenLot('gbl-x', 4, {
      sourceType: GreenBeanSourceType.External, parchmentLotId: undefined, parchmentWithdrawalId: undefined,
    })
    render(<EditGreenBeanLotModal lot={external} greenBeanLots={[gbl6, external]} onClose={() => {}} onSaved={vi.fn()} />)

    expect(screen.queryByTestId('edit-green-bean-hull-limit')).not.toBeInTheDocument()
  })

  it('shows the backend 400 sentence when the server still refuses', async () => {
    const refusal = 'Green bean lots cannot weigh more than the parchment they were hulled from. The Hull & Grade of parchment lot PCH-2026-5 hulled 16.00 kg of parchment and its other green bean lots weigh 10.00 kg, so this lot can weigh at most 6.00 kg.'
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError(refusal, 400, { error: refusal, maxWeightKg: 6 }))
    const onError = vi.fn()
    // The loaded list is out of date: it does not know about a third lot.
    render(
      <EditGreenBeanLotModal
        lot={gbl7} parchmentLot={hulledParchment} greenBeanLots={[gbl6, gbl7]}
        onClose={() => {}} onSaved={vi.fn()} onError={onError}
      />,
    )

    weightTo('7')
    save()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(refusal))
    expect(screen.getByRole('alert')).toHaveTextContent(refusal)
  })
})
