import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { HarvestLot } from '../../../types'
import { api } from '../../../services/api'
import { deleteHarvestLot, updateHarvestLotDetails } from '../../../services/lots/harvestLotService'
import EditHarvestLotModal from './EditHarvestLotModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

const lot: HarvestLot = {
  id: 'hl-1', displayId: 'HL-2026-12', farmId: 'farm-1', farmerName: 'Somchai',
  cherryVariety: 'Catimor', weightKg: 400, farmPlotLocation: 'Plot A',
  harvestDate: '2026-09-15', status: 'Ready for Processing', cropYearId: 'cy-2026',
}

const backendLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'hl-1', displayId: 'HL-2026-12', farmId: 'farm-1', farmerName: 'Somchai',
  cherryVariety: 'Catimor', weightKg: 400, remainingWeightKg: 400,
  farmPlotLocation: 'Plot A', harvestDate: '2026-09-15T00:00:00.000Z',
  status: 'ReadyForProcessing', cropYearId: 'cy-2026',
  ...overrides,
})

describe('EditHarvestLotModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the lot and farmer read-only and opens on the current values', () => {
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Edit cherry lot' })).toBeInTheDocument()
    expect(screen.getByText('HL-2026-12')).toBeInTheDocument()
    expect(screen.getByText('Somchai')).toBeInTheDocument()
    // Identity is shown, not editable
    expect(screen.queryByDisplayValue('Somchai')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Variety')).toHaveValue('Catimor')
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(400)
    expect(screen.getByLabelText('Plot location')).toHaveValue('Plot A')
    expect(screen.getByRole('group', { name: 'Harvest date' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '15 September 2026' })).toBeInTheDocument()
  })

  it('sends only the changed ones of variety, weight, plot location and harvest date', async () => {
    vi.mocked(api.put).mockResolvedValue({
      harvestLot: backendLot({ cherryVariety: 'Typica', weightKg: 385.5, farmPlotLocation: 'Plot B' }),
    })
    const onSaved = vi.fn()
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Variety'), { target: { value: '  Typica ' } })
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '385.5' } })
    fireEvent.change(screen.getByLabelText('Plot location'), { target: { value: 'Plot B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledTimes(1)
    const [endpoint, payload] = vi.mocked(api.put).mock.calls[0]
    // The guard makes the backend refuse once the lot is processed, for any role.
    expect(endpoint).toBe('/harvest-lots/hl-1?ifUnprocessed=1')
    // Exactly the changed keys: no unchanged harvestDate, and never
    // farmerName, status, cropYearId or farmId.
    expect(payload).toStrictEqual({
      cherryVariety: 'Typica', weightKg: 385.5, farmPlotLocation: 'Plot B',
    })
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      id: 'hl-1', cherryVariety: 'Typica', weightKg: 385.5, farmPlotLocation: 'Plot B', harvestDate: '2026-09-15',
    })
  })

  it('corrects only the weight of a lot whose stored plot is blank', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ farmPlotLocation: '', weightKg: 390 }) })
    const onSaved = vi.fn()
    render(<EditHarvestLotModal lot={{ ...lot, farmPlotLocation: '  ' }} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '390' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0][1]).toStrictEqual({ weightKg: 390 })
  })

  it('refuses to clear the plot location, as the backend does', () => {
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Plot location'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Enter the plot location.')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('closes without a request when nothing changed', () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<EditHarvestLotModal lot={lot} onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it.each(['', '0', '-3', 'abc'])('refuses to save a weight of %p', (value) => {
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Enter a weight greater than 0.')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('requires a variety and a harvest date', () => {
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Variety'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '15 September 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Enter the cherry variety.')).toBeInTheDocument()
    expect(screen.getByText('Pick the harvest date.')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('disables Save while the request is in flight', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(api.put).mockReturnValue(new Promise((r) => { resolve = r }))
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '390' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const saving = await screen.findByRole('button', { name: /Saving/ })
    expect(saving).toBeDisabled()
    fireEvent.click(saving)
    expect(api.put).toHaveBeenCalledTimes(1)

    resolve({ harvestLot: backendLot() })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
  })

  it('explains a permission refusal inline and reports it', async () => {
    // A 403 comes back as { error: 'Forbidden' }; the api client throws that text.
    vi.mocked(api.put).mockRejectedValue(new Error('Forbidden'))
    const onSaved = vi.fn()
    const onError = vi.fn()
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={onSaved} onError={onError} />)

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '390' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const message = "You can't edit this lot. Processors can only change cherry lots that haven't been processed yet."
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onError).toHaveBeenCalledWith(message)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows the backend reason inline when it gives one', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('This lot has already been processed'))
    render(<EditHarvestLotModal lot={lot} onClose={() => {}} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '390' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This lot has already been processed')
  })
})

describe('updateHarvestLotDetails', () => {
  it('drops any extra keys a caller passes in', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot() })
    await updateHarvestLotDetails('hl-1', {
      cherryVariety: 'Catimor', weightKg: 400, farmPlotLocation: 'Plot A', harvestDate: '2026-09-15',
      // Simulate a sloppy caller spreading a whole lot into the payload.
      ...({ farmerName: 'X', status: 'Complete', farmId: 'f', cropYearId: 'c' } as object),
    })
    expect(vi.mocked(api.put).mock.calls.at(-1)?.[1]).toStrictEqual({
      cherryVariety: 'Catimor', weightKg: 400, farmPlotLocation: 'Plot A', harvestDate: '2026-09-15',
    })
  })

  it('sends only the fields it is given, with the unprocessed guard', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot() })
    await updateHarvestLotDetails('hl-1', { weightKg: 390, farmPlotLocation: undefined })
    expect(vi.mocked(api.put).mock.calls.at(-1)).toStrictEqual([
      '/harvest-lots/hl-1?ifUnprocessed=1', { weightKg: 390 },
    ])
  })
})

describe('deleteHarvestLot', () => {
  it('asks for the unprocessed guard only when told to', async () => {
    vi.mocked(api.delete).mockResolvedValue({})
    await deleteHarvestLot('hl-1')
    await deleteHarvestLot('hl-1', { ifUnprocessed: true })
    expect(vi.mocked(api.delete).mock.calls).toEqual([
      ['/harvest-lots/hl-1'],
      ['/harvest-lots/hl-1?ifUnprocessed=1'],
    ])
  })
})
