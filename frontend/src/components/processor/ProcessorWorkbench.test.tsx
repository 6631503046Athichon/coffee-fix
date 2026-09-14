import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { ProcessingBatchStatus, UserRole } from '../../types'
import type { AppData, HarvestLot } from '../../types'
import { addProcessingBatch } from '../../services/processing/processingBatchService'
import ProcessorWorkbench from './ProcessorWorkbench'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  addProcessingBatch: vi.fn(),
}))

const lot: HarvestLot = {
  id: 'hl-f442', displayId: 'HL-2026-44', weightKg: 400, remainingWeightKg: 200,
  status: 'Ready for Processing', farmerName: 'Farmer', cherryVariety: 'Catimor',
  farmPlotLocation: '', harvestDate: '2026-09-15',
}

const batch = {
  id: 'pb-1', harvestLotId: lot.id, processType: 'Washed',
  status: ProcessingBatchStatus.Completed, parchmentWeightKg: 80,
}

function Harness({ initial, refreshData }: { initial: AppData; refreshData: () => Promise<void> }) {
  const [data, setData] = useState(initial)
  return (
    <DataContext.Provider value={{ data, setData, refreshData, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ProcessorWorkbench currentUser={{ id: 'processor', name: 'Processor', roles: [UserRole.Processor] }} />
      </ToastProvider>
    </DataContext.Provider>
  )
}

describe('Record Process', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['Workflow', 'Data Grid'])('hides an old partial lot with a batch in %s', (view) => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [lot], processingBatches: [batch] }} refreshData={async () => {}} />)
    if (view === 'Data Grid') fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    expect(screen.queryByRole('button', { name: 'Record Process' })).not.toBeInTheDocument()
  })

  it('records the measured output once and removes the whole lot without waiting for a refresh', async () => {
    // Keep the refresh pending: the successful save alone must remove the lot.
    const refreshData = vi.fn(() => new Promise<void>(() => {}))
    vi.mocked(addProcessingBatch).mockResolvedValue(batch)
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [lot] }} refreshData={refreshData} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record Process' }))

    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    expect(form).toHaveTextContent('Whole Lot Weight400.00 kg')
    expect(form).not.toHaveTextContent('Cherry Available')
    fireEvent.change(form.querySelector('[name="parchmentWeightKg"]')!, { target: { value: '80' } })
    fireEvent.change(form.querySelector('[name="moistureContent"]')!, { target: { value: '11' } })
    fireEvent.submit(form)

    await waitFor(() => expect(refreshData).toHaveBeenCalledTimes(1))
    expect(addProcessingBatch).toHaveBeenCalledTimes(1)
    expect(addProcessingBatch).toHaveBeenCalledWith(expect.objectContaining({
      harvestLotId: lot.id, parchmentWeightKg: 80, status: ProcessingBatchStatus.Completed,
    }))
    expect(screen.queryByRole('button', { name: 'Record Process' })).not.toBeInTheDocument()
    expect(screen.queryByText('320.00 kg')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
