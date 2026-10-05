import React, { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import ToastContainer from '../common/ToastContainer'
import { ParchmentSourceType, ProcessingBatchStatus, UserRole } from '../../types'
import type { AppData, DryingLogEntry, HarvestLot, ParchmentLot, ProcessingBatch } from '../../types'
import { formatDateDisplay } from '../../utils/formatters'
import { todayDateOnly } from '../../utils/dateOnly'
import {
  addDryingLog,
  deleteDryingLog,
  updateDryingLog,
} from '../../services/processing/processingBatchService'
import ProcessorWorkbench from './ProcessorWorkbench'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  addDryingLog: vi.fn(),
  updateDryingLog: vi.fn(),
  deleteDryingLog: vi.fn(),
}))

// Quality Insights' Drying Curve Analysis and the public trace page's drying
// averages read a batch's drying readings, which no screen recorded. The
// workbench's Drying log popup, opened from a parchment card or row, lists
// them and lets the batch's processor (or an Admin) add, edit and delete them.

const cherry = (id: string): HarvestLot => ({
  id, displayId: id.toUpperCase(), weightKg: 400, status: 'Complete', farmerName: 'Somchai',
  cherryVariety: 'Catimor', farmPlotLocation: '', harvestDate: '2026-09-15',
})

const reading = (id: string, date: string, moistureContent: number): DryingLogEntry => ({
  id, date, moistureContent, ambientTemp: 30, relativeHumidity: 65,
})

const batch = (id: string, createdById: string, dryingLog: DryingLogEntry[]): ProcessingBatch => ({
  id, displayId: id.toUpperCase(), harvestLotId: `hl-${id}`, createdById,
  status: ProcessingBatchStatus.Completed, processType: 'Washed', parchmentWeightKg: 100,
  moistureContent: 11, dryingLog,
})

const parchment = (id: string, displayId: string, batchId?: string): ParchmentLot => ({
  id, displayId, processingBatchId: batchId, harvestLotId: batchId ? `hl-${batchId}` : undefined,
  sourceType: batchId ? ParchmentSourceType.Internal : ParchmentSourceType.External,
  initialWeightKg: 100, currentWeightKg: 80, moistureContent: 11, processType: 'Washed',
  status: 'AwaitingHulling',
})

// Stored out of order: the popup lists them oldest first.
const mineBatch = batch('pb-mine', 'processor', [
  reading('log-2', '2026-09-05', 18),
  reading('log-1', '2026-09-03', 35),
])
const freshBatch = batch('pb-fresh', 'processor', [])
const theirBatch = batch('pb-theirs', 'other', [reading('log-9', '2026-09-04', 20)])

const initialData = (): AppData => ({
  ...INITIAL_APP_DATA,
  harvestLots: [cherry('hl-pb-mine'), cherry('hl-pb-fresh'), cherry('hl-pb-theirs')],
  processingBatches: [mineBatch, freshBatch, theirBatch],
  parchmentLots: [
    parchment('pl-mine', 'PCH-MINE', 'pb-mine'),
    parchment('pl-fresh', 'PCH-FRESH', 'pb-fresh'),
    parchment('pl-theirs', 'PCH-THEIRS', 'pb-theirs'),
    parchment('pl-ext', 'PCH-EXT'),
  ],
})

function Harness({ roles = [UserRole.Processor], onData }: {
  roles?: UserRole[]
  onData?: (data: AppData) => void
}) {
  const [data, setData] = useState(initialData)
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ProcessorWorkbench currentUser={{ id: 'processor', name: 'Processor', roles }} />
        <ToastContainer />
      </ToastProvider>
    </DataContext.Provider>
  )
}

const entry = (lot: string) => screen.queryByRole('button', { name: `Drying log of ${lot}` })
const openLog = (lot: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Drying log of ${lot}` }))
  return screen.getByRole('dialog')
}
const rowsOf = (popup: HTMLElement) =>
  within(within(popup).getByTestId('drying-log-table')).getAllByRole('row').slice(1)
// The app's one display format: never the Buddhist-era th-TH date.
const day = (date: string) => formatDateDisplay(date)
const field = (popup: HTMLElement, label: string) =>
  within(popup).getByLabelText(label) as HTMLInputElement
const lastData = (onData: ReturnType<typeof vi.fn>): AppData => onData.mock.calls.at(-1)![0]

describe('Workbench drying log', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the reading count on each parchment card of a batch; bought-in parchment has none', () => {
    render(<Harness />)
    expect(entry('PCH-MINE')).toHaveTextContent('2 readings')
    expect(entry('PCH-FRESH')).toHaveTextContent('Add readings')
    // Another processor's batch: its readings can be looked at, not changed.
    expect(entry('PCH-THEIRS')).toHaveTextContent('1 reading')
    expect(entry('PCH-EXT')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    expect(entry('PCH-MINE')).toHaveAttribute('title', 'Drying log (2 readings)')
    expect(entry('PCH-EXT')).toBeNull()
  })

  it('lists the readings oldest first and adds one dated today', async () => {
    vi.mocked(addDryingLog).mockImplementation(async (_batchId, log) => ({ id: 'log-new', ...log }))
    const onData = vi.fn()
    render(<Harness onData={onData} />)

    const popup = openLog('PCH-MINE')
    expect(popup).toHaveTextContent('Drying log')
    expect(popup).toHaveTextContent('Batch PB-MINE · PCH-MINE')
    expect(rowsOf(popup).map((row) => row.textContent)).toEqual([
      `${day('2026-09-03')}35%30 °C65%`,
      `${day('2026-09-05')}18%30 °C65%`,
    ])

    fireEvent.change(field(popup, 'Moisture (%)'), { target: { value: '12.5' } })
    fireEvent.change(field(popup, 'Temp (°C)'), { target: { value: '29' } })
    fireEvent.change(field(popup, 'Humidity (%)'), { target: { value: '60' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Add reading' }))

    await waitFor(() => expect(addDryingLog).toHaveBeenCalledWith('pb-mine', {
      date: todayDateOnly(), moistureContent: 12.5, ambientTemp: 29, relativeHumidity: 60,
    }))
    await waitFor(() => expect(rowsOf(popup)).toHaveLength(3))
    // The batch in the app data has it too (Quality Insights reads it there).
    expect(lastData(onData).processingBatches[0].dryingLog?.map((l) => l.id)).toEqual([
      'log-1', 'log-2', 'log-new',
    ])
    // The form is cleared for the next reading.
    expect(field(popup, 'Moisture (%)').value).toBe('')

    fireEvent.click(within(popup).getByRole('button', { name: 'Close' }))
    expect(entry('PCH-MINE')).toHaveTextContent('3 readings')
  })

  it('refuses a moisture over 100% before saving', () => {
    render(<Harness />)
    const popup = openLog('PCH-FRESH')
    expect(popup).toHaveTextContent('No readings yet.')

    fireEvent.change(field(popup, 'Moisture (%)'), { target: { value: '120' } })
    fireEvent.change(field(popup, 'Temp (°C)'), { target: { value: '29' } })
    fireEvent.change(field(popup, 'Humidity (%)'), { target: { value: '60' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Add reading' }))

    expect(popup).toHaveTextContent('Enter a moisture between 0 and 100%.')
    expect(addDryingLog).not.toHaveBeenCalled()
  })

  it('edits a reading, sending only what changed', async () => {
    vi.mocked(updateDryingLog).mockImplementation(async (_batchId, logId, changes) => ({
      ...reading(logId, '2026-09-03', 35), ...changes,
    }))
    const onData = vi.fn()
    render(<Harness onData={onData} />)
    const popup = openLog('PCH-MINE')

    fireEvent.click(within(popup).getByRole('button', { name: `Edit the reading of ${day('2026-09-03')}` }))
    expect(field(popup, 'Moisture (%)').value).toBe('35')
    fireEvent.change(field(popup, 'Moisture (%)'), { target: { value: '33.5' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Save reading' }))

    await waitFor(() => expect(updateDryingLog).toHaveBeenCalledWith('pb-mine', 'log-1', { moistureContent: 33.5 }))
    await waitFor(() => expect(rowsOf(popup)[0]).toHaveTextContent('33.5%'))
    expect(lastData(onData).processingBatches[0].dryingLog?.[0]).toMatchObject({ id: 'log-1', moistureContent: 33.5 })
    expect(within(popup).getByRole('button', { name: 'Add reading' })).toBeInTheDocument()
  })

  it('deletes a reading after asking in the popup', async () => {
    vi.mocked(deleteDryingLog).mockResolvedValue(undefined)
    const onData = vi.fn()
    render(<Harness onData={onData} />)
    const popup = openLog('PCH-MINE')

    fireEvent.click(within(popup).getByRole('button', { name: `Delete the reading of ${day('2026-09-05')}` }))
    const confirm = within(popup).getByRole('alertdialog')
    expect(confirm).toHaveTextContent(`Delete the reading of ${day('2026-09-05')}?`)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep' }))
    expect(deleteDryingLog).not.toHaveBeenCalled()
    expect(rowsOf(popup)).toHaveLength(2)

    fireEvent.click(within(popup).getByRole('button', { name: `Delete the reading of ${day('2026-09-05')}` }))
    fireEvent.click(within(within(popup).getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteDryingLog).toHaveBeenCalledWith('pb-mine', 'log-2'))
    await waitFor(() => expect(rowsOf(popup)).toHaveLength(1))
    expect(lastData(onData).processingBatches[0].dryingLog?.map((l) => l.id)).toEqual(['log-1'])
  })

  it('shows a save failure in the popup and keeps the typed reading', async () => {
    vi.mocked(addDryingLog).mockRejectedValue(new Error('Insufficient permissions'))
    render(<Harness />)
    const popup = openLog('PCH-FRESH')

    fireEvent.change(field(popup, 'Moisture (%)'), { target: { value: '12' } })
    fireEvent.change(field(popup, 'Temp (°C)'), { target: { value: '29' } })
    fireEvent.change(field(popup, 'Humidity (%)'), { target: { value: '60' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Add reading' }))

    expect(await within(popup).findByRole('alert')).toHaveTextContent(
      'Only the processor who recorded this batch, or an admin, can change its drying log.',
    )
    expect(field(popup, 'Moisture (%)').value).toBe('12')
  })

  it('another processor\'s batch is read-only for a Processor', () => {
    render(<Harness />)
    const popup = openLog('PCH-THEIRS')
    expect(rowsOf(popup)).toHaveLength(1)
    expect(within(popup).queryByRole('button', { name: 'Add reading' })).toBeNull()
    expect(within(popup).queryByRole('button', { name: /Edit the reading/ })).toBeNull()
    expect(within(popup).queryByRole('button', { name: /Delete the reading/ })).toBeNull()
  })

  it.each([
    ['an Admin', [UserRole.Admin]],
    ['an Admin who is also a Processor', [UserRole.Processor, UserRole.Admin]],
  ])('%s adds, edits and deletes readings on anyone\'s batch', async (_who, roles) => {
    vi.mocked(addDryingLog).mockImplementation(async (_batchId, log) => ({ id: 'log-admin', ...log }))
    render(<Harness roles={roles} />)
    const popup = openLog('PCH-THEIRS')
    expect(within(popup).getByRole('button', { name: `Edit the reading of ${day('2026-09-04')}` })).toBeInTheDocument()
    expect(within(popup).getByRole('button', { name: `Delete the reading of ${day('2026-09-04')}` })).toBeInTheDocument()

    fireEvent.change(field(popup, 'Moisture (%)'), { target: { value: '15' } })
    fireEvent.change(field(popup, 'Temp (°C)'), { target: { value: '31' } })
    fireEvent.change(field(popup, 'Humidity (%)'), { target: { value: '62' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Add reading' }))
    await waitFor(() => expect(addDryingLog).toHaveBeenCalledWith('pb-theirs', expect.objectContaining({ moistureContent: 15 })))
  })
})
