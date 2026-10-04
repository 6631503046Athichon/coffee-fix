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
import type { AppData, Customer, GreenBeanLot, HarvestLot, ParchmentLot, ProcessType, User } from '../../types'
import { addProcessingBatch } from '../../services/processing/processingBatchService'
import { createWithdrawal } from '../../services/lots/greenBeanLotService'
import { addCustomer } from '../../services/sales/customerService'
import {
  createParchmentWithdrawal,
  getAllParchmentLots,
} from '../../services/lots/parchmentLotService'
import { formatDateDisplay } from '../../utils/formatters'
import ParchmentTab from './ParchmentTab'
import { ROASTER_REQUIRED_MESSAGE } from './workbench'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  addProcessingBatch: vi.fn(),
}))

vi.mock('../../services/lots/parchmentLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/parchmentLotService')>(),
  createParchmentWithdrawal: vi.fn(),
  getAllParchmentLots: vi.fn(),
}))

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  createWithdrawal: vi.fn(),
}))

vi.mock('../../services/sales/customerService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/sales/customerService')>(),
  addCustomer: vi.fn(),
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
  id, displayId, sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
  parchmentLotId: 'pl-new', grade, initialWeightKg: kg, currentWeightKg: kg,
  availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
  ...(price !== undefined && {
    pricePerKg: price, currency: 'THB', priceSetDate: '2026-09-27', priceSetBy: 'processor',
  }),
})

function Harness({ refreshData, onData, initial, roles = [UserRole.Processor] }: {
  refreshData: () => Promise<void>
  onData?: (data: AppData) => void
  initial?: Partial<AppData>
  roles?: UserRole[]
}) {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, harvestLots: [cherry], ...initial })
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ParchmentTab currentUser={{ id: 'processor', name: 'Processor', roles }} />
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

describe('Green bean Withdraw Stock', () => {
  // One Washed · Grade A bucket over two lots; FIFO draws the older one first.
  const washed: ParchmentLot = {
    ...newParchment, id: 'pl-w', displayId: 'PL-2026-3', processType: 'Washed',
    currentWeightKg: 0, status: 'Hulled',
  }
  const stockLot = (id: string, displayId: string, kg: number, createdAt: string): GreenBeanLot => ({
    ...newLot(id, displayId, 'Grade A', kg), parchmentLotId: 'pl-w', createdAt,
  })
  const older = stockLot('gbl-a', 'GBL-2026-60', 6, '2026-09-01T00:00:00Z')
  const newer = stockLot('gbl-b', 'GBL-2026-61', 10, '2026-09-05T00:00:00Z')
  const cafe: Customer = { id: 'c-1', name: 'Cafe Doi', type: 'Retailer', address: '12 Nimman Rd' }
  // Shaped like an Admin's user list: deactivated accounts included, newest first.
  const users: User[] = [
    { id: 'r-3', name: 'Zeta Roasters', roles: [UserRole.Roaster], isActive: true },
    { id: 'r-2', name: 'Old Roastery', roles: [UserRole.Roaster], isActive: false },
    { id: 'r-1', name: 'Hill Roastery', roles: [UserRole.Roaster], isActive: true },
    { id: 'p-2', name: 'Other Processor', roles: [UserRole.Processor], isActive: true },
  ]
  const stock: Partial<AppData> = {
    harvestLots: [], parchmentLots: [washed], greenBeanLots: [newer, older], customers: [cafe], users,
  }

  // The popup's own box, so role queries do not walk the whole page.
  const popup = () => screen.getByText('Withdraw Stock').closest('.rounded-2xl') as HTMLElement
  const openWithdraw = (type?: string) => {
    fireEvent.click(screen.getByText('Withdraw', { selector: 'button' }))
    if (type) fireEvent.click(within(popup()).getByRole('button', { name: type }))
  }
  const amount = () => within(popup()).getByPlaceholderText('0.0') as HTMLInputElement
  const save = () => fireEvent.click(within(popup()).getByText('Save', { selector: 'button' }))
  const pick = (current: string, option: string) => {
    fireEvent.click(within(popup()).getByRole('button', { name: current }))
    fireEvent.click(within(popup()).getByRole('button', { name: option }))
  }
  const drawn = (lot: GreenBeanLot, kg: number) => ({ greenBeanLot: { ...lot, currentWeightKg: kg } })

  beforeEach(() => vi.clearAllMocks())

  it('asks for the Sale customer, address and price and sends them on every FIFO lot', async () => {
    vi.mocked(createWithdrawal)
      .mockResolvedValueOnce(drawn(older, 0))
      .mockResolvedValueOnce(drawn(newer, 8))
    const refreshData = vi.fn(async () => {})
    render(<Harness refreshData={refreshData} initial={stock} />)
    openWithdraw() // Sale is the default type here

    // The Workbench's Sale fields: customer picker with + New customer, address, price and currency.
    const group = within(popup()).getByRole('group', { name: 'Customer' })
    expect(within(group).getByRole('button', { name: 'New customer' })).not.toHaveClass('bg-blue-600')
    pick('Select customer...', 'Cafe Doi (Retailer)')
    const address = within(popup()).getByLabelText('Delivery Address') as HTMLInputElement
    expect(address.value).toBe('12 Nimman Rd')
    expect(within(popup()).getByRole('button', { name: 'THB' })).toBeInTheDocument()
    fireEvent.change(within(popup()).getByLabelText('Price per kg'), { target: { value: '180' } })
    fireEvent.change(amount(), { target: { value: '8' } })

    // The live total is for the whole amount, not one lot's share.
    expect(within(popup()).getByText('Total').nextElementSibling).toHaveTextContent('1,440.00 THB')
    save()

    await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(2))
    const sale = {
      withdrawalType: 'Sale', purpose: 'Sale', salePrice: 180, currency: 'THB',
      customerName: 'Cafe Doi', deliveryAddress: '12 Nimman Rd',
    }
    expect(vi.mocked(createWithdrawal).mock.calls).toEqual([
      ['gbl-a', { amountKg: 6, ...sale }],
      ['gbl-b', { amountKg: 2, ...sale }],
    ])
    await waitFor(() => expect(screen.queryByText('Withdraw Stock')).not.toBeInTheDocument())
    expect(refreshData).toHaveBeenCalledTimes(1)
  }, 15000)

  it('+ New customer saves, lists and picks the customer without withdrawing', async () => {
    vi.mocked(addCustomer).mockResolvedValue({
      id: 'c-9', name: 'Hill Roasters', type: 'Roaster', address: '9 Doi Rd',
    })
    const onData = vi.fn()
    render(<Harness refreshData={async () => {}} onData={onData} initial={{ ...stock, customers: [] }} />)
    openWithdraw()
    expect(within(popup()).getByRole('button', { name: 'No customers yet' })).toBeDisabled()
    const newCustomer = within(popup()).getByRole('button', { name: 'New customer' })
    expect(newCustomer).toHaveClass('bg-blue-600')
    fireEvent.click(newCustomer)

    const dialog = screen.getByRole('dialog', { name: 'Create New Customer' })
    fireEvent.change(within(dialog).getByLabelText('Customer Name *'), { target: { value: 'Hill Roasters' } })
    fireEvent.change(within(dialog).getByPlaceholderText('123 Main St, City, Country'), {
      target: { value: '9 Doi Rd' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Customer' }))

    expect(await within(popup()).findByRole('button', { name: 'Hill Roasters (Roaster)' })).toBeEnabled()
    expect((within(popup()).getByLabelText('Delivery Address') as HTMLInputElement).value).toBe('9 Doi Rd')
    await waitFor(() => expect(onData.mock.lastCall![0].customers).toEqual([
      { id: 'c-9', name: 'Hill Roasters', type: 'Roaster', address: '9 Doi Rd' },
    ]))
    expect(createWithdrawal).not.toHaveBeenCalled()
  }, 15000)

  it('requires a target roaster for Roast and pushes every FIFO lot to it, for an Admin too', async () => {
    vi.mocked(createWithdrawal)
      .mockResolvedValueOnce(drawn(older, 0))
      .mockResolvedValueOnce(drawn(newer, 8))
    render(<Harness refreshData={async () => {}} initial={stock} roles={[UserRole.Admin]} />)
    openWithdraw('Roast')
    expect(within(popup()).queryByLabelText('Price per kg')).not.toBeInTheDocument()
    fireEvent.change(amount(), { target: { value: '8' } })
    fireEvent.change(within(popup()).getByPlaceholderText('e.g., Order #123, Sample roast...'), {
      target: { value: 'Batch 12' },
    })

    // Refused before any lot is drawn, instead of the backend's 400.
    save()
    expect(within(popup()).getByText(ROASTER_REQUIRED_MESSAGE)).toBeInTheDocument()
    expect(createWithdrawal).not.toHaveBeenCalled()

    const group = within(popup()).getByRole('group', { name: /Target Roaster/ })
    fireEvent.click(within(group).getByRole('button', { name: 'Select Roaster...' }))
    // Only active users with the Roaster role are offered, by name.
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Select Roaster...', 'Hill Roastery', 'Zeta Roasters',
    ])
    fireEvent.click(within(group).getByRole('button', { name: 'Hill Roastery' }))
    save()

    await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(2))
    const roast = { withdrawalType: 'Roasting Stock', purpose: 'Batch 12', targetRoasterId: 'r-1' }
    expect(vi.mocked(createWithdrawal).mock.calls).toEqual([
      ['gbl-a', { amountKg: 6, ...roast }],
      ['gbl-b', { amountKg: 2, ...roast }],
    ])
  }, 15000)

  it('brings a refused Save\'s error into view, since the Sale fields make the popup scroll on a phone', () => {
    // jsdom has no scrollIntoView.
    const original = Element.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      render(<Harness refreshData={async () => {}} initial={stock} />)
      openWithdraw()
      save()
      const banner = within(popup()).getByRole('alert')
      expect(banner).toHaveTextContent('Amount must be greater than 0.')
      expect(scrollIntoView.mock.contexts).toContain(banner)
      expect(createWithdrawal).not.toHaveBeenCalled()
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('stops at the lot that completes the amount instead of drawing a float crumb from the next', async () => {
    // 49.1 - 30.2 - 18.9 is 3.6e-15 in floats, not 0.
    const lots = [
      stockLot('gbl-1', 'GBL-2026-71', 30.2, '2026-09-01T00:00:00Z'),
      stockLot('gbl-2', 'GBL-2026-72', 18.9, '2026-09-02T00:00:00Z'),
      stockLot('gbl-3', 'GBL-2026-73', 10, '2026-09-03T00:00:00Z'),
    ]
    vi.mocked(createWithdrawal).mockResolvedValue(drawn(lots[0], 0))
    render(<Harness refreshData={async () => {}} initial={{ ...stock, greenBeanLots: lots }} roles={[UserRole.Admin]} />)
    openWithdraw('Roast')
    pick('Select Roaster...', 'Hill Roastery')
    fireEvent.change(amount(), { target: { value: '49.1' } })
    save()

    await waitFor(() => expect(screen.queryByText('Withdraw Stock')).not.toBeInTheDocument())
    const roast = { withdrawalType: 'Roasting Stock', purpose: 'Roasting Stock', targetRoasterId: 'r-1' }
    expect(vi.mocked(createWithdrawal).mock.calls).toEqual([
      ['gbl-1', { amountKg: 30.2, ...roast }],
      ['gbl-2', { amountKg: 18.9, ...roast }],
    ])
  }, 15000)

  it('cannot be closed while the lots are still being drawn', async () => {
    let finish: (value: Awaited<ReturnType<typeof createWithdrawal>>) => void = () => {}
    vi.mocked(createWithdrawal)
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValueOnce(drawn(newer, 8))
    render(<Harness refreshData={async () => {}} initial={stock} />)
    openWithdraw('Sample')
    fireEvent.change(amount(), { target: { value: '8' } })
    const close = within(popup()).getByRole('button', { name: 'Close' })
    expect(close).toBeEnabled()
    save()

    // Both ways out stay shut until every lot is drawn.
    await waitFor(() => expect(close).toBeDisabled())
    expect(within(popup()).getByText('Cancel', { selector: 'button' })).toBeDisabled()
    fireEvent.click(close)
    expect(screen.getByText('Withdraw Stock')).toBeInTheDocument()

    finish(drawn(older, 0))
    await waitFor(() => expect(screen.queryByText('Withdraw Stock')).not.toBeInTheDocument())
    expect(createWithdrawal).toHaveBeenCalledTimes(2)
  }, 15000)

  it('starts the next withdrawal without the last customer, price or address', () => {
    render(<Harness refreshData={async () => {}} initial={stock} />)
    openWithdraw()
    pick('Select customer...', 'Cafe Doi (Retailer)')
    fireEvent.change(within(popup()).getByLabelText('Price per kg'), { target: { value: '180' } })
    fireEvent.click(within(popup()).getByText('Cancel', { selector: 'button' }))

    openWithdraw()
    expect(within(popup()).getByRole('button', { name: 'Select customer...' })).toBeInTheDocument()
    expect((within(popup()).getByLabelText('Delivery Address') as HTMLInputElement).value).toBe('')
    expect((within(popup()).getByLabelText('Price per kg') as HTMLInputElement).value).toBe('')
  })

  it('reports how much was drawn when a later lot fails, and Save again draws only the rest', async () => {
    vi.mocked(createWithdrawal)
      .mockResolvedValueOnce(drawn(older, 0))
      .mockRejectedValueOnce(new Error('Insufficient weight available'))
      .mockResolvedValueOnce(drawn(newer, 8))
    const refreshData = vi.fn(async () => {})
    render(<Harness refreshData={refreshData} initial={stock} />)
    openWithdraw('Sample')
    fireEvent.change(amount(), { target: { value: '8' } })
    save()

    expect(await within(popup()).findByText(
      'Withdrew 6.00 of 8.00 kg. The other 2.00 kg were not withdrawn: Insufficient weight available',
    )).toBeInTheDocument()
    expect(createWithdrawal).toHaveBeenCalledTimes(2)
    // The drawn lot leaves the popup and the page reloads its figures.
    expect(amount().value).toBe('2')
    expect(within(popup()).getByText('drawn FIFO from 1 lot')).toBeInTheDocument()
    expect(refreshData).toHaveBeenCalledTimes(1)

    save()
    await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(3))
    expect(vi.mocked(createWithdrawal).mock.calls[2]).toEqual([
      'gbl-b', { amountKg: 2, withdrawalType: 'Sample', purpose: 'Sample' },
    ])
    await waitFor(() => expect(screen.queryByText('Withdraw Stock')).not.toBeInTheDocument())
  }, 15000)
})

describe('Process type colours', () => {
  const processType = (name: string, hue: string, isActive = true): ProcessType => ({
    id: `pt-${name}`, name, createdDate: '2026-09-01', isActive,
    colorScheme: {
      borderColor: `border-l-${hue}-500`, iconBg: `bg-${hue}-100`, iconColor: `text-${hue}-600`,
      badgeColor: `bg-${hue}-100 text-${hue}-700 border-${hue}-200`,
    },
  })
  // Honey is switched off by the admin; Anaerobic is a newer type.
  const processTypes = [
    processType('Washed', 'blue'), processType('Natural', 'yellow'),
    processType('Honey', 'amber', false), processType('Anaerobic', 'purple'),
  ]
  const chipGroup = () => document.querySelector('[role="group"][aria-label="Process type"]') as HTMLElement

  beforeEach(() => vi.clearAllMocks())

  it('offers the admin process types as coloured chips and sends the picked name', async () => {
    vi.mocked(addProcessingBatch).mockRejectedValue(new Error('stop here'))
    render(<Harness refreshData={async () => {}} initial={{ processTypes }} />)
    openProcess()

    const chips = within(chipGroup()).getAllByRole('button')
    expect(chips.map((b) => b.textContent)).toEqual(['Washed', 'Natural', 'Anaerobic'])
    // Honey is not offered any more, so the first type is picked.
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    expect(chips[0]).toHaveClass('bg-blue-600', 'text-white')
    expect(chips[2]).toHaveClass('bg-purple-50', 'text-purple-800')

    fireEvent.click(chips[2])
    expect(chips[2]).toHaveAttribute('aria-pressed', 'true')
    expect(chips[0]).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(weight(1), { target: { value: '60' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(addProcessingBatch).toHaveBeenCalledTimes(1))
    expect(addProcessingBatch).toHaveBeenCalledWith(expect.objectContaining({ processType: 'Anaerobic' }))
  }, 15000)

  it('still starts on Honey with the classic types while the list is empty', async () => {
    vi.mocked(addProcessingBatch).mockRejectedValue(new Error('stop here'))
    render(<Harness refreshData={async () => {}} />)
    openProcess()
    const chips = within(chipGroup()).getAllByRole('button')
    expect(chips.map((b) => b.textContent)).toEqual(['Honey', 'Natural', 'Washed'])
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(weight(1), { target: { value: '60' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(addProcessingBatch).toHaveBeenCalledWith(expect.objectContaining({ processType: 'Honey' })))
  }, 15000)

  it('colours the green bean group, card and pill with the admin colour, inactive types included', () => {
    const lot = (id: string, parchmentLotId: string): GreenBeanLot => ({
      ...newLot(id, `GBL-${id}`, 'Grade A', 10), parchmentLotId,
    })
    const parchment = (id: string, processType: string): ParchmentLot => ({
      ...newParchment, id, processType, currentWeightKg: 0, status: 'Hulled',
    })
    render(
      <Harness
        refreshData={async () => {}}
        initial={{
          harvestLots: [], processTypes,
          parchmentLots: [parchment('pl-w', 'Washed'), parchment('pl-h', 'Honey')],
          greenBeanLots: [lot('w', 'pl-w'), lot('h', 'pl-h')],
        }}
      />,
    )
    const [washedHeader, washedCard] = screen.getAllByText('Washed', { selector: 'span' })
    expect(washedHeader).toHaveClass('bg-blue-100', 'text-blue-700', 'border-blue-200')
    expect(washedCard).toHaveClass('bg-blue-100')
    expect(washedCard.closest('.border-l-4')).toHaveClass('border-l-blue-500')
    const [honeyHeader, honeyCard] = screen.getAllByText('Honey', { selector: 'span' })
    expect(honeyHeader).toHaveClass('bg-amber-100', 'text-amber-700')
    expect(honeyCard.closest('.border-l-4')).toHaveClass('border-l-amber-500')
  })
})

describe('Green-bean stock holds only lots the user may draw from (F12)', () => {
  const washed: ParchmentLot = {
    ...newParchment, id: 'pl-w', displayId: 'PL-2026-3', processType: 'Washed',
    currentWeightKg: 0, status: 'Hulled',
  }
  const lot = (id: string, kg: number, createdAt: string, extra: Partial<GreenBeanLot>): GreenBeanLot => ({
    ...newLot(id, `GBL-${id}`, 'Grade A', kg), parchmentLotId: 'pl-w', createdAt, ...extra,
  })
  // Oldest first, so a FIFO draw reaches the lots this user may not touch first.
  const roasters = lot('roaster', 20, '2026-08-01T00:00:00Z', {
    createdById: 'r-1', sourceType: GreenBeanSourceType.External, parchmentLotId: undefined,
    externalSource: {
      originName: 'Doi Chang Co-op', variety: 'Catimor', processType: 'Washed',
      purchaseDate: '2026-07-30', pricePerKg: 300, currency: 'THB',
    },
  })
  const noCreator = lot('legacy', 3, '2026-08-15T00:00:00Z', { createdById: undefined })
  const otherProcessors = lot('other', 10, '2026-09-01T00:00:00Z', { createdById: 'p-2' })
  const mine = lot('mine', 6, '2026-09-05T00:00:00Z', {})
  const stock: Partial<AppData> = {
    harvestLots: [], parchmentLots: [washed],
    greenBeanLots: [mine, otherProcessors, noCreator, roasters],
  }

  const kpi = (label: string) =>
    screen.getByText(label, { selector: 'p.uppercase' }).nextElementSibling as HTMLElement
  const popup = () => screen.getByText('Withdraw Stock').closest('.rounded-2xl') as HTMLElement
  const withdraw = async (kg: string) => {
    fireEvent.click(screen.getByText('Withdraw', { selector: 'button' }))
    fireEvent.click(within(popup()).getByRole('button', { name: 'Sample' }))
    fireEvent.change(within(popup()).getByPlaceholderText('0.0'), { target: { value: kg } })
    fireEvent.click(within(popup()).getByText('Save', { selector: 'button' }))
    await waitFor(() => expect(screen.queryByText('Withdraw Stock')).not.toBeInTheDocument())
  }
  const drawnIds = () => vi.mocked(createWithdrawal).mock.calls.map(([id]) => id)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createWithdrawal).mockImplementation(async (id) => ({
      greenBeanLot: { ...mine, id, currentWeightKg: 0 },
    }))
  })

  it('a Processor sees and draws only their own lots, so the draw never hits a 403', async () => {
    render(<Harness refreshData={async () => {}} initial={stock} />)
    expect(kpi('Green Bean')).toHaveTextContent(/^6\s*kg$/)
    expect(screen.getByText('from 1 source')).toBeInTheDocument()

    await withdraw('6')
    expect(drawnIds()).toEqual(['mine'])
  }, 15000)

  it('an Admin draws from every processor lot but never a roaster\'s purchased External lot', async () => {
    render(<Harness refreshData={async () => {}} initial={stock} roles={[UserRole.Admin]} />)
    expect(kpi('Green Bean')).toHaveTextContent(/^19\s*kg$/)
    expect(screen.getByText('from 3 sources')).toBeInTheDocument()

    await withdraw('19')
    expect(drawnIds()).toEqual(['legacy', 'other', 'mine'])
  }, 15000)

  it('a lot whose parchment lot is not loaded groups under its nested process type, not Unknown', () => {
    const natural = lot('natural', 8, '2026-09-10T00:00:00Z', {
      parchmentLotId: 'pl-not-loaded', parchmentProcessType: 'Natural',
    })
    render(
      <Harness
        refreshData={async () => {}}
        initial={{ harvestLots: [], parchmentLots: [], greenBeanLots: [natural] }}
      />,
    )
    expect(screen.getAllByText('Natural', { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('Unknown', { selector: 'span' })).not.toBeInTheDocument()
  })
})

describe('Source history withdrawals', () => {
  it('lists a withdrawal sent without its purpose cleanly', () => {
    // On someone else's lot the backend withholds the purpose with the sale:
    // the row keeps its type and kg, with no dangling separator.
    const washed: ParchmentLot = {
      ...newParchment, id: 'pl-w', displayId: 'PL-2026-3', processType: 'Washed',
      currentWeightKg: 0, status: 'Hulled',
    }
    const lot: GreenBeanLot = {
      ...newLot('gbl-h', 'GBL-2026-50', 'Grade A', 6), parchmentLotId: 'pl-w',
      withdrawalHistory: [{ amountKg: 4, withdrawalType: 'Sale', date: '2026-09-20', saleDetailsHidden: true }],
    }
    render(
      <Harness
        refreshData={async () => {}}
        initial={{ harvestLots: [], parchmentLots: [washed], greenBeanLots: [lot] }}
      />,
    )
    fireEvent.click(screen.getByLabelText('View source history'))
    const rows = screen.getByText('Withdrawals (1)').nextElementSibling as HTMLElement
    expect(rows).toHaveTextContent('Sale')
    expect(rows).toHaveTextContent('4')
    expect(rows).not.toHaveTextContent('·')
    expect(rows).not.toHaveTextContent('undefined')
  })

  it("dates the lot and its parchment by their Thai day, in the app's date format", () => {
    // 02:30 on 5 Oct in Thailand is still 4 Oct in UTC.
    const washed: ParchmentLot = {
      ...newParchment, id: 'pl-w', displayId: 'PL-2026-3', processType: 'Washed',
      currentWeightKg: 0, status: 'Hulled', createdAt: '2026-10-04T19:30:00.000Z',
    }
    const lot: GreenBeanLot = {
      ...newLot('gbl-h', 'GBL-2026-50', 'Grade A', 6), parchmentLotId: 'pl-w',
      createdAt: '2026-10-04T19:30:00.000Z',
    }
    render(
      <Harness
        refreshData={async () => {}}
        initial={{ harvestLots: [], parchmentLots: [washed], greenBeanLots: [lot] }}
      />,
    )
    fireEvent.click(screen.getByLabelText('View source history'))
    const day = formatDateDisplay('2026-10-05')
    expect(screen.getByText(`Green Bean · ${day}`)).toBeInTheDocument()
    expect(screen.getByText(day, { selector: 'span' })).toBeInTheDocument()
  })
})
