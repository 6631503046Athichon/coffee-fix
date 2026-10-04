import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ParchmentSourceType, ProcessingBatchStatus } from '../../../types'
import type { HarvestLot, ParchmentLot, ProcessingBatch, ProcessType } from '../../../types'
import { api } from '../../../services/api'
import { ApiError } from '../../../services/apiError'
import EditProcessingBatchModal from './EditProcessingBatchModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// F24: the batch edit popup. Only the changed fields go to PUT
// /processing-batches/:id, which re-weighs the batch's parchment lot in the
// same transaction and never below what already went out of it.

const processType = (name: string, hue: string): ProcessType => ({
  id: `pt-${name}`,
  name,
  colorScheme: {
    borderColor: `border-l-${hue}-500`,
    iconBg: `bg-${hue}-100`,
    iconColor: `text-${hue}-600`,
    badgeColor: `bg-${hue}-100 text-${hue}-700 border-${hue}-200`,
  },
  createdDate: '2026-09-01',
  isActive: true,
})
const processTypes = [processType('Washed', 'blue'), processType('Natural', 'yellow')]

const cherryLot: HarvestLot = {
  id: 'hl-1', displayId: 'HL-2026-44', weightKg: 400, status: 'Complete', farmerName: 'Somchai',
  cherryVariety: 'Catimor', farmPlotLocation: '', harvestDate: '2026-09-15',
}

const batch: ProcessingBatch = {
  id: 'pb-1', displayId: 'PB-2026-3', harvestLotId: 'hl-1', createdById: 'processor',
  status: ProcessingBatchStatus.Completed, processType: 'Washed', processNotes: 'Ferment 24h',
  parchmentWeightKg: 100, moistureContent: 11, dryingStartDate: '2026-09-01',
  dryingEndDate: '2026-09-20', baggingDate: '2026-09-20',
}

// 40 kg of its 100 kg already went out (withdrawn or hulled).
const parchmentLot: ParchmentLot = {
  id: 'pl-1', displayId: 'PCH-2026-9', processingBatchId: 'pb-1', harvestLotId: 'hl-1',
  sourceType: ParchmentSourceType.Internal, initialWeightKg: 100, currentWeightKg: 60,
  moistureContent: 11, processType: 'Washed', status: 'AwaitingHulling',
}

const savedBatch = (overrides: Record<string, unknown> = {}) => ({
  id: 'pb-1', displayId: 'PB-2026-3', harvestLotId: 'hl-1', createdById: 'processor',
  status: 'Completed', processType: 'Washed', processNotes: 'Ferment 24h',
  parchmentWeightKg: 100, moistureContent: 11,
  dryingStartDate: '2026-09-01T12:00:00.000Z', dryingEndDate: '2026-09-20T12:00:00.000Z',
  baggingDate: '2026-09-20T12:00:00.000Z',
  parchmentLots: [{
    id: 'pl-1', displayId: 'PCH-2026-9', processingBatchId: 'pb-1', harvestLotId: 'hl-1',
    sourceType: 'Internal', initialWeightKg: 100, currentWeightKg: 60, moistureContent: 11,
    processType: 'Washed', status: 'AwaitingHulling',
  }],
  ...overrides,
})

const renderModal = (props: Partial<React.ComponentProps<typeof EditProcessingBatchModal>> = {}) => {
  const onSaved = vi.fn()
  const onError = vi.fn()
  const onClose = vi.fn()
  render(
    <EditProcessingBatchModal
      batch={batch}
      parchmentLot={parchmentLot}
      cherryLot={cherryLot}
      processTypes={processTypes}
      onClose={onClose}
      onSaved={onSaved}
      onError={onError}
      {...props}
    />,
  )
  return { onSaved, onError, onClose }
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

describe('EditProcessingBatchModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the batch as recorded, with what already went out of its parchment', () => {
    renderModal()

    expect(screen.getByRole('dialog', { name: 'Edit processing batch' })).toBeInTheDocument()
    expect(screen.getByText('PB-2026-3')).toBeInTheDocument()
    expect(screen.getByText('PCH-2026-9')).toBeInTheDocument()
    expect(screen.getByText('HL-2026-44')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Washed', pressed: true })).toBeInTheDocument()
    expect(screen.getByLabelText('Parchment output (kg)')).toHaveValue(100)
    expect(screen.getByLabelText('Moisture (%)')).toHaveValue(11)
    expect(screen.getByLabelText('Process notes')).toHaveValue('Ferment 24h')
    expect(screen.getByRole('button', { name: '1 September 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '20 September 2026' })).toBeInTheDocument()
    expect(screen.getByTestId('edit-batch-stock')).toHaveTextContent(
      '40.00 kg already withdrawn or hulled, so the output cannot go below that. 60.00 kg left in stock after saving.',
    )
  })

  it('sends only the changed process type, output, moisture and notes, and hands back the re-weighed lot', async () => {
    vi.mocked(api.put).mockResolvedValue({
      processingBatch: savedBatch({
        processType: 'Natural', parchmentWeightKg: 90, moistureContent: 10.5, processNotes: 'Raised beds',
        parchmentLots: [{ ...savedBatch().parchmentLots[0], initialWeightKg: 90, currentWeightKg: 50, processType: 'Natural', moistureContent: 10.5 }],
      }),
    })
    const { onSaved } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Natural' }))
    fireEvent.change(screen.getByLabelText('Parchment output (kg)'), { target: { value: '90' } })
    expect(screen.getByTestId('edit-batch-stock')).toHaveTextContent('50.00 kg left in stock after saving.')
    fireEvent.change(screen.getByLabelText('Moisture (%)'), { target: { value: '10.5' } })
    fireEvent.change(screen.getByLabelText('Process notes'), { target: { value: ' Raised beds ' } })
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const [endpoint, payload] = vi.mocked(api.put).mock.calls[0]
    expect(endpoint).toBe('/processing-batches/pb-1')
    // Exactly the changed keys: the unchanged dates are not sent.
    expect(payload).toStrictEqual({
      processType: 'Natural', processNotes: 'Raised beds', parchmentWeightKg: 90, moistureContent: 10.5,
    })
    const result = onSaved.mock.calls[0][0]
    expect(result.processingBatch).toMatchObject({ id: 'pb-1', processType: 'Natural', parchmentWeightKg: 90 })
    expect(result.parchmentLots[0]).toMatchObject({ id: 'pl-1', initialWeightKg: 90, currentWeightKg: 50, processType: 'Natural' })
  })

  it('refuses an output below what already went out, or above the cherry, without sending', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Parchment output (kg)'), { target: { value: '39.5' } })
    save()
    expect(screen.getByText(/40\.00 kg of this lot already went out/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Parchment output (kg)'), { target: { value: '401' } })
    save()
    expect(screen.getByText(/cannot weigh more than the cherry lot it came from \(400\.00 kg\)/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('moves the bagging date with a corrected drying end date and checks the order of the pair', async () => {
    vi.mocked(api.put).mockResolvedValue({ processingBatch: savedBatch() })
    const { onSaved } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: '20 September 2026' }))
    fireEvent.click(screen.getByRole('button', { name: '22' }))
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0][1]).toStrictEqual({
      dryingEndDate: '2026-09-22', baggingDate: '2026-09-22',
    })
  })

  it('refuses a drying end date before the start date', () => {
    renderModal({ batch: { ...batch, dryingStartDate: '2026-09-21' } })

    fireEvent.click(screen.getByRole('button', { name: '20 September 2026' }))
    fireEvent.click(screen.getByRole('button', { name: '10' }))
    save()

    expect(screen.getByText('The drying end date cannot be before the start date.')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('closes without a request when nothing changed', () => {
    const { onClose } = renderModal()
    fireEvent.change(screen.getByLabelText('Parchment output (kg)'), { target: { value: '100.0' } })
    save()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.put).not.toHaveBeenCalled()
  })

  it('shows the backend 409 sentence and a permission sentence for a 403', async () => {
    const conflict = '40.00 kg of this batch\'s parchment has already been withdrawn, hulled or sold, so its weight cannot go below 40.00 kg'
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError(conflict, 409, { error: conflict }))
    const { onError, onSaved } = renderModal()

    fireEvent.change(screen.getByLabelText('Parchment output (kg)'), { target: { value: '45' } })
    save()
    await waitFor(() => expect(onError).toHaveBeenCalledWith(conflict))
    expect(screen.getByRole('alert')).toHaveTextContent(conflict)

    vi.mocked(api.put).mockRejectedValueOnce(new Error('Insufficient permissions'))
    save()
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith(
      'Only the processor who recorded this batch, or an admin, can edit it.',
    ))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
