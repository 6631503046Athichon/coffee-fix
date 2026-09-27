import React, { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import {
  GreenBeanSourceType,
  ParchmentSourceType,
  ProcessingBatchStatus,
  UserRole,
} from '../../types'
import type { AppData, GreenBeanLot, HarvestLot, ParchmentLot } from '../../types'
import { addProcessingBatch } from '../../services/processing/processingBatchService'
import {
  createParchmentWithdrawal,
  getAllParchmentLots,
} from '../../services/lots/parchmentLotService'
import ParchmentTab from './ParchmentTab'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  addProcessingBatch: vi.fn(),
}))

vi.mock('../../services/lots/parchmentLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/parchmentLotService')>(),
  createParchmentWithdrawal: vi.fn(),
  getAllParchmentLots: vi.fn(),
}))

const cherry: HarvestLot = {
  id: 'hl-1', displayId: 'HL-2026-9', weightKg: 400, remainingWeightKg: 400,
  status: 'Ready for Processing', farmerName: 'Farmer', cherryVariety: 'Catimor',
  farmPlotLocation: '', harvestDate: '2026-09-20',
}

const newParchment: ParchmentLot = {
  id: 'pl-new', displayId: 'PL-2026-12', processingBatchId: 'pb-1', harvestLotId: 'hl-1',
  sourceType: ParchmentSourceType.Internal, initialWeightKg: 100, currentWeightKg: 100,
  moistureContent: 11, processType: 'Honey', status: 'AwaitingHulling',
}

const newLot = (id: string, displayId: string, grade: string, kg: number, price?: number): GreenBeanLot => ({
  id, displayId, sourceType: GreenBeanSourceType.Internal,
  parchmentLotId: 'pl-new', grade, initialWeightKg: kg, currentWeightKg: kg,
  availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
  ...(price !== undefined && {
    pricePerKg: price, currency: 'THB', priceSetDate: '2026-09-27', priceSetBy: 'processor',
  }),
})

function Harness({ refreshData, onData }: {
  refreshData: () => Promise<void>
  onData?: (data: AppData) => void
}) {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, harvestLots: [cherry] })
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ParchmentTab currentUser={{ id: 'processor', name: 'Processor', roles: [UserRole.Processor] }} />
      </ToastProvider>
    </DataContext.Provider>
  )
}

const weight = (row: number) => screen.getByLabelText(`Weight (kg), row ${row}`)
const price = (row: number) => screen.getByLabelText(`Price per kg in THB (optional), row ${row}`)
// Text queries rather than getByRole, which is slow over a whole page.
const saveButton = () => screen.getByText('Save & Grade', { selector: 'button' })
const summary = () => screen.getByText('Total green bean').parentElement!.parentElement!
// The "12,500.00 THB value" line under the kg total.
const valueLine = () => screen.queryByText(/^[\d,]+\.\d{2} THB$/)

const openProcess = () => {
  fireEvent.click(screen.getByText('Process & Grade', { selector: 'button' }))
  fireEvent.change(screen.getByPlaceholderText('e.g. 85.0'), { target: { value: '100' } })
  fireEvent.change(screen.getByPlaceholderText('e.g. 12.0'), { target: { value: '11' } })
}

const pickGrade = (grade: string) => {
  fireEvent.click(screen.getByText('Select grade').closest('button')!)
  fireEvent.click(screen.getByText(grade, { selector: 'button' }))
}

const addRow = () => fireEvent.click(screen.getByText('Add grade', { selector: 'button' }))

const addGrade = (grade: string) => {
  addRow()
  pickGrade(grade)
}

describe('Process & Grade price', () => {
  beforeEach(() => vi.clearAllMocks())

  it('puts an optional THB price input directly after the weight on every grade split', () => {
    render(<Harness refreshData={async () => {}} />)
    openProcess()
    addGrade('Grade B')

    for (const row of [1, 2]) {
      const input = price(row) as HTMLInputElement
      // The next control in tab order after the weight is the price.
      const controls = Array.from(document.body.querySelectorAll('input, button, select, textarea'))
      expect(controls[controls.indexOf(weight(row)) + 1]).toBe(input)
      expect(input).toHaveAttribute('inputmode', 'decimal')
      expect(input).toHaveAttribute('placeholder', 'Optional')
      expect(input.parentElement).toHaveTextContent('THB')
      expect(weight(row)).toHaveAttribute('placeholder', '0.00')
    }
    // The column header on wide screens, plus a label per row for phones.
    expect(screen.getAllByText('(optional)')).toHaveLength(3)
    for (const hint of screen.getAllByText('(optional)')) {
      expect(hint.parentElement).toHaveTextContent('Price / kg (optional)')
    }
  }, 15000)

  it('sends each price with its own grade, skips an untouched row, closes before the reload, and shows the prices in Source History', async () => {
    vi.mocked(addProcessingBatch).mockResolvedValue({
      id: 'pb-1', harvestLotId: 'hl-1', processType: 'Honey',
      status: ProcessingBatchStatus.Completed, parchmentWeightKg: 100,
    })
    vi.mocked(getAllParchmentLots).mockResolvedValue([newParchment])
    vi.mocked(createParchmentWithdrawal).mockResolvedValue({
      parchmentLot: { ...newParchment, currentWeightKg: 0, status: 'Hulled' },
      greenBeanLots: [
        newLot('gbl-1', 'GBL-2026-50', 'Grade A', 60, 220.5),
        newLot('gbl-2', 'GBL-2026-51', 'Grade C', 20),
        newLot('gbl-3', 'GBL-2026-52', 'Peaberry', 10, 150),
      ],
    })
    const onData = vi.fn()
    // Keep the reload pending: the lots must come from the save response.
    const refreshData = vi.fn(() => new Promise<void>(() => {}))
    render(<Harness refreshData={refreshData} onData={onData} />)
    openProcess()
    addGrade('Grade B') // row 2 stays untouched and is skipped
    addGrade('Grade C')
    addGrade('Peaberry')
    fireEvent.change(weight(1), { target: { value: '60' } })
    fireEvent.change(price(1), { target: { value: '220.50' } })
    fireEvent.change(weight(3), { target: { value: '20' } })
    fireEvent.change(weight(4), { target: { value: '10' } })
    fireEvent.change(price(4), { target: { value: '150' } })
    expect(screen.getByText('14,730.00 THB')).toHaveTextContent(
      '14,730.00 THB value · 2 of 3 grades priced',
    )
    expect(summary()).toHaveClass('bg-green-50')
    fireEvent.click(saveButton())

    await waitFor(() => expect(createParchmentWithdrawal).toHaveBeenCalledTimes(1))
    const [lotId, payload] = vi.mocked(createParchmentWithdrawal).mock.calls[0]
    expect(lotId).toBe('pl-new')
    expect(payload).toMatchObject({ withdrawalType: 'HullAndGrade', totalGreenBeanWeight: 90 })
    expect(payload.gradedLots).toEqual([
      { grade: 'Grade A', weight: 60, price: 220.5 },
      { grade: 'Grade C', weight: 20 },
      { grade: 'Peaberry', weight: 10, price: 150 },
    ])

    // The popup closes while the reload is still pending.
    await waitFor(() => expect(screen.queryByText('Save & Grade', { selector: 'button' })).not.toBeInTheDocument())
    expect(refreshData).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(onData.mock.lastCall![0].greenBeanLots).toHaveLength(3))
    const stored = onData.mock.lastCall![0] as AppData
    expect(stored.greenBeanLots[0]).toMatchObject({ id: 'gbl-1', pricePerKg: 220.5, currency: 'THB' })
    expect(stored.greenBeanLots[1].pricePerKg).toBeUndefined()
    // The parchment comes along so the new lots group under their process type.
    expect(stored.parchmentLots).toContainEqual(expect.objectContaining({ id: 'pl-new', processType: 'Honey' }))

    // Buckets sort by grade: Grade A, Grade C, Peaberry.
    const history = screen.getAllByLabelText('View source history')
    expect(history).toHaveLength(3)
    fireEvent.click(history[0])
    const gradeA = screen.getByText('GBL-2026-50').closest('.shadow-sm') as HTMLElement
    expect(within(gradeA).getByText('220.50 THB/kg')).toBeInTheDocument()
    fireEvent.click(history[1])
    const gradeC = screen.getByText('GBL-2026-51').closest('.shadow-sm') as HTMLElement
    expect(within(gradeC).getByText('No price')).toBeInTheDocument()
  }, 20000)

  it('refuses a half-filled row instead of dropping it and its price', () => {
    render(<Harness refreshData={async () => {}} />)
    openProcess()
    fireEvent.change(weight(1), { target: { value: '60' } })
    fireEvent.change(price(1), { target: { value: '220' } })
    expect(saveButton()).toBeEnabled()

    // Row 2: weight and price, but no grade.
    addRow()
    fireEvent.change(weight(2), { target: { value: '20' } })
    fireEvent.change(price(2), { target: { value: '150' } })
    expect(screen.getByText('Pick a grade for row 2.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(summary()).not.toHaveClass('bg-green-50')

    // A grade and a price, but no weight.
    pickGrade('Grade B')
    fireEvent.change(weight(2), { target: { value: '' } })
    expect(screen.getByText('Enter a weight above 0 for row 2 (Grade B).')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    fireEvent.click(saveButton())
    expect(addProcessingBatch).not.toHaveBeenCalled()
    expect(createParchmentWithdrawal).not.toHaveBeenCalled()

    fireEvent.change(weight(2), { target: { value: '20' } })
    expect(screen.queryByText(/for row 2/)).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(summary()).toHaveClass('bg-green-50')
  }, 15000)

  it('flags a price of 0, -1, abc or 1.234 on its row and blocks Save & Grade, but not Cancel', () => {
    render(<Harness refreshData={async () => {}} />)
    openProcess()
    fireEvent.change(weight(1), { target: { value: '80' } })
    // No price is fine: saving is open and no value is shown.
    expect(saveButton()).toBeEnabled()
    expect(summary()).toHaveClass('bg-green-50')
    expect(valueLine()).not.toBeInTheDocument()

    for (const [typed, message] of [
      ['0', 'Must be more than 0'],
      ['-1', 'Must be more than 0'],
      ['abc', 'Numbers only, e.g. 1200.50'],
      ['1.234', 'Max 2 decimals'],
    ]) {
      fireEvent.change(price(1), { target: { value: typed } })
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(price(1)).toHaveAttribute('aria-invalid', 'true')
      expect(saveButton()).toBeDisabled()
      // The summary does not look ready while the price holds Save back.
      expect(summary()).not.toHaveClass('bg-green-50')
      // Only saving is blocked: the popup can still be cancelled.
      expect(screen.getByText('Cancel', { selector: 'button' })).toBeEnabled()
      expect(valueLine()).not.toBeInTheDocument()
    }
    fireEvent.click(saveButton())
    expect(addProcessingBatch).not.toHaveBeenCalled()

    fireEvent.change(price(1), { target: { value: '180.5' } })
    expect(saveButton()).toBeEnabled()
    expect(valueLine()).toHaveTextContent('14,440.00 THB value')
  }, 15000)
})
