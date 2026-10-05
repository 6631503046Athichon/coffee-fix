import React, { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import ToastContainer from '../common/ToastContainer'
import { CuppingSessionType, GreenBeanSourceType, ParchmentSourceType, ProcessingBatchStatus, SCA_SENSORY_ATTRIBUTES, UserRole } from '../../types'
import type { AppData, CuppingSession, Customer, GreenBeanLot, HarvestLot, ParchmentLot, ProcessType } from '../../types'
import { addProcessingBatch } from '../../services/processing/processingBatchService'
import { createWithdrawal, generatePublicTraceId, getPublicTraceUrl, updateGreenBeanLotAvailability, updateGreenBeanLotPrice, updateGreenBeanLotScore } from '../../services/lots/greenBeanLotService'
import { addCustomer } from '../../services/sales/customerService'
import { deleteHarvestLot, updateHarvestLotDetails } from '../../services/lots/harvestLotService'
import { createParchmentWithdrawal } from '../../services/lots/parchmentLotService'
import { api } from '../../services/api'
import ProcessorWorkbench from './ProcessorWorkbench'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  addProcessingBatch: vi.fn(),
}))

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  updateGreenBeanLotPrice: vi.fn(),
  updateGreenBeanLotScore: vi.fn(),
  updateGreenBeanLotAvailability: vi.fn(),
  createWithdrawal: vi.fn(),
  generatePublicTraceId: vi.fn(),
  // jsdom has no canvas: hand back the URL the QR would encode.
  generateQRDataUrl: vi.fn(async (url: string) => `data:image/png;qr,${encodeURIComponent(url)}`),
}))

vi.mock('../../services/sales/customerService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/sales/customerService')>(),
  addCustomer: vi.fn(),
}))

vi.mock('../../services/lots/harvestLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/harvestLotService')>(),
  updateHarvestLotDetails: vi.fn(),
  deleteHarvestLot: vi.fn(),
}))

vi.mock('../../services/lots/parchmentLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/parchmentLotService')>(),
  createParchmentWithdrawal: vi.fn(),
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

function Harness({ initial, refreshData, onData, roles = [UserRole.Processor], isSuperAdmin = false, withToasts = false }: {
  initial: AppData
  refreshData: () => Promise<void>
  onData?: (data: AppData) => void
  roles?: UserRole[]
  isSuperAdmin?: boolean
  withToasts?: boolean
}) {
  const [data, setData] = useState(initial)
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ProcessorWorkbench currentUser={{ id: 'processor', name: 'Processor', roles, isSuperAdmin }} />
        {withToasts && <ToastContainer />}
      </ToastProvider>
    </DataContext.Provider>
  )
}

// Every test renders the whole workbench, which takes seconds under a full
// parallel run, so these suites get the same 20 s budget as the other
// heavy workbench tests.
describe('Record Process', { timeout: 20000 }, () => {
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

  // F39: the drying dates (and output and process type) lived on in workbench
  // state after Cancel, and were saved on the next lot recorded.
  it('starts the next lot clean after a Cancel instead of saving the cancelled lot\'s dates', async () => {
    const processTypes: ProcessType[] = ['Natural', 'Washed'].map((name) => ({
      id: `pt-${name}`, name, createdDate: '2026-09-01', isActive: true,
      colorScheme: { borderColor: 'border-l-gray-400', iconBg: 'bg-gray-100', iconColor: 'text-gray-600', badgeColor: 'bg-gray-100 text-gray-700 border-gray-200' },
    }))
    const other: HarvestLot = { ...lot, id: 'hl-other', displayId: 'HL-2026-45' }
    vi.mocked(addProcessingBatch).mockResolvedValue({ ...batch, harvestLotId: other.id })
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, harvestLots: [lot, other], processTypes }}
        refreshData={() => new Promise<void>(() => {})}
      />,
    )
    const formOf = () => screen.getByRole('button', { name: 'Save' }).closest('form')!
    const field = (name: string) => formOf().querySelector<HTMLInputElement>(`[name="${name}"]`)!
    const pickToday = (label: string) => {
      const picker = within(formOf()).getByText(label).parentElement as HTMLElement
      fireEvent.click(within(picker).getAllByRole('button')[0])
      fireEvent.click(within(picker).getByRole('button', { name: 'Today' }))
    }

    // Fill in the first lot, then cancel it.
    fireEvent.click(screen.getAllByRole('button', { name: 'Record Process' })[0])
    pickToday('Drying Start Date')
    pickToday('Drying End Date')
    fireEvent.click(within(formOf()).getByRole('button', { name: 'Washed' }))
    fireEvent.change(field('parchmentWeightKg'), { target: { value: '80' } })
    expect(field('dryingStartDate').value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(field('processType').value).toBe('Washed')
    fireEvent.click(within(formOf()).getByRole('button', { name: 'Cancel' }))

    // The next lot opens with nothing carried over.
    fireEvent.click(screen.getAllByRole('button', { name: 'Record Process' })[1])
    expect(formOf()).toHaveTextContent('Lot #HL-2026-45')
    expect(field('dryingStartDate').value).toBe('')
    expect(field('dryingEndDate').value).toBe('')
    expect(field('parchmentWeightKg').value).toBe('')
    expect(field('processType').value).toBe('Natural')
    expect(within(formOf()).getAllByText('Select date')).toHaveLength(2)
    // F47: flat header icon and the blue primary Save, no gradient.
    expect(formOf().querySelector('[class*="bg-gradient"]')).toBeNull()
    expect(within(formOf()).getByRole('button', { name: 'Save' })).toHaveClass('bg-blue-600')

    fireEvent.change(field('parchmentWeightKg'), { target: { value: '70' } })
    fireEvent.change(field('moistureContent'), { target: { value: '11' } })
    fireEvent.submit(formOf())

    await waitFor(() => expect(addProcessingBatch).toHaveBeenCalledTimes(1))
    expect(addProcessingBatch).toHaveBeenCalledWith(expect.objectContaining({
      harvestLotId: other.id, processType: 'Natural', parchmentWeightKg: 70,
      dryingStartDate: '', dryingEndDate: '', baggingDate: '',
    }))
  })
})

describe('Green bean price', { timeout: 20000 }, () => {
  const greenLot: GreenBeanLot = {
    id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
    grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
    availabilityStatus: 'Available', cuppingScores: [],
    withdrawalHistory: [{ amountKg: 10, withdrawalType: 'Sample', purpose: 'Sample', date: '2026-09-01' }],
  }

  beforeEach(() => vi.clearAllMocks())

  it('sets a price from the lot card and merges only the price into the stored lot', async () => {
    // The PUT response is thinner than bulk-load (here: no withdrawal history);
    // the stored lot must keep what it already had.
    vi.mocked(updateGreenBeanLotPrice).mockResolvedValue({
      ...greenLot, pricePerKg: 180, currency: 'THB', priceSetDate: '2026-09-23',
      priceSetBy: 'processor', withdrawalHistory: [],
    })
    const onData = vi.fn()
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [greenLot] }}
        refreshData={async () => {}}
        onData={onData}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Set price of GBL-2026-7' }))
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))

    expect(await screen.findByRole('button', { name: 'Edit price of GBL-2026-7' })).toBeInTheDocument()
    expect(updateGreenBeanLotPrice).toHaveBeenCalledWith('gbl-1', expect.objectContaining({
      pricePerKg: 180, currency: 'THB',
    }))
    expect(screen.queryByRole('button', { name: 'Save price' })).not.toBeInTheDocument()

    // onData fires from an effect, so the stored copy can lag the screen by a tick.
    await waitFor(() => expect(onData.mock.lastCall![0].greenBeanLots[0]).toMatchObject({
      pricePerKg: 180, currency: 'THB', priceSetDate: '2026-09-23', priceSetBy: 'processor',
    }))
    expect(onData.mock.lastCall![0].greenBeanLots[0].withdrawalHistory).toHaveLength(1)
  })

  it('offers the price action in the data grid too', () => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [greenLot] }} refreshData={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Price' }))
    expect(screen.getByRole('button', { name: 'Save price' })).toBeInTheDocument()
  })
})

describe('Sale customer picker', { timeout: 20000 }, () => {
  const stockLot: GreenBeanLot = {
    id: 'gbl-1', displayId: 'GBL-2026-1', sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
    grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
    availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
  }
  const cafe: Customer = { id: 'c-1', name: 'Cafe Doi', type: 'Retailer', address: '12 Nimman Rd' }
  const aroma: Customer = { id: 'c-2', name: 'Aroma Co', type: 'Distributor' }

  const openSale = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }))
  }
  const pick = (current: string, option: string) => {
    fireEvent.click(screen.getByRole('button', { name: current }))
    fireEvent.click(screen.getByRole('button', { name: option }))
  }
  const address = () => screen.getByLabelText('Delivery Address') as HTMLInputElement
  const form = () => screen.getByRole('button', { name: 'Save' }).closest('form')!

  beforeEach(() => vi.clearAllMocks())

  it('with no customers shows an empty picker and a prominent New customer action', () => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot] }} refreshData={async () => {}} />)
    openSale()
    expect(screen.getByRole('button', { name: 'No customers yet' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New customer' })).toHaveClass('bg-blue-600')
    // No free-text customer name any more: the customer is picked.
    expect(screen.queryByPlaceholderText('Customer name...')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Or type name...')).not.toBeInTheDocument()
  })

  it('lists the customers by name, fills the address from the pick and sends name and address', async () => {
    vi.mocked(createWithdrawal).mockResolvedValue({ greenBeanLot: { ...stockLot, currentWeightKg: 35 } })
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot], customers: [cafe, aroma] }}
        refreshData={async () => {}}
      />,
    )
    openSale()
    expect(screen.getByRole('button', { name: 'New customer' })).not.toHaveClass('bg-blue-600')

    fireEvent.click(screen.getByRole('button', { name: 'Select customer...' }))
    const group = screen.getByRole('group', { name: 'Customer' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'New customer', 'Select customer...', 'Aroma Co (Distributor)', 'Cafe Doi (Retailer)',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Cafe Doi (Retailer)' }))
    expect(address().value).toBe('12 Nimman Rd')

    // A customer without an address drops the one the last pick filled in...
    pick('Cafe Doi (Retailer)', 'Aroma Co (Distributor)')
    expect(address().value).toBe('')
    // ...but keeps one typed by hand.
    fireEvent.change(address(), { target: { value: 'Gate 2' } })
    pick('Aroma Co (Distributor)', 'No customer')
    expect(screen.getByRole('button', { name: 'Select customer...' })).toBeInTheDocument()
    expect(address().value).toBe('Gate 2')

    pick('Select customer...', 'Cafe Doi (Retailer)')
    fireEvent.change(address(), { target: { value: '12 Nimman Rd, back door' } })
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '180' } })
    fireEvent.change(form().querySelector('[name="amountKg"]')!, { target: { value: '5' } })
    fireEvent.submit(form())

    await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(1))
    expect(createWithdrawal).toHaveBeenCalledWith('gbl-1', {
      amountKg: 5,
      withdrawalType: 'Sale',
      purpose: 'Sale',
      salePrice: 180,
      currency: 'THB',
      customerName: 'Cafe Doi',
      deliveryAddress: '12 Nimman Rd, back door',
    })
  })

  it('New customer saves the customer, lists it and picks it without submitting the withdrawal', async () => {
    vi.mocked(addCustomer).mockResolvedValue({
      id: 'c-9', name: 'Hill Roasters', type: 'Roaster', address: '9 Doi Rd',
    })
    const onData = vi.fn()
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot] }}
        refreshData={async () => {}}
        onData={onData}
      />,
    )
    openSale()
    fireEvent.click(screen.getByRole('button', { name: 'New customer' }))

    const dialog = screen.getByRole('dialog', { name: 'Create New Customer' })
    fireEvent.change(within(dialog).getByLabelText('Customer Name *'), { target: { value: 'Hill Roasters' } })
    fireEvent.change(within(dialog).getByPlaceholderText('123 Main St, City, Country'), {
      target: { value: '9 Doi Rd' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Customer' }))

    expect(await screen.findByRole('button', { name: 'Hill Roasters (Roaster)' })).toBeEnabled()
    expect(addCustomer).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Hill Roasters', type: 'Roaster', address: '9 Doi Rd',
    }))
    expect(address().value).toBe('9 Doi Rd')
    await waitFor(() => expect(onData.mock.lastCall![0].customers).toEqual([
      { id: 'c-9', name: 'Hill Roasters', type: 'Roaster', address: '9 Doi Rd' },
    ]))

    // The customer popup closes itself; the withdrawal stays open and unsent.
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: 'Create New Customer' })).not.toBeInTheDocument(),
      { timeout: 2000 },
    )
    expect(screen.getByRole('button', { name: 'Hill Roasters (Roaster)' })).toBeInTheDocument()
    expect(createWithdrawal).not.toHaveBeenCalled()
  })

  it('does not pick a customer whose popup was closed before the save finished', async () => {
    const nextLot: GreenBeanLot = { ...stockLot, id: 'gbl-2', displayId: 'GBL-2026-2' }
    let finishSave!: (customer: Customer) => void
    vi.mocked(addCustomer).mockImplementation(() => new Promise((resolve) => { finishSave = resolve }))
    const onData = vi.fn()
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot, nextLot] }}
        refreshData={async () => {}}
        onData={onData}
      />,
    )
    const withdrawLot = (index: number, displayId: string) => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' })[index])
      expect(screen.getByText(`Lot #${displayId}`)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sale' }))
    }

    withdrawLot(0, 'GBL-2026-1')
    fireEvent.click(screen.getByRole('button', { name: 'New customer' }))
    const dialog = screen.getByRole('dialog', { name: 'Create New Customer' })
    fireEvent.change(within(dialog).getByLabelText('Customer Name *'), { target: { value: 'Hill' } })
    fireEvent.change(within(dialog).getByPlaceholderText('123 Main St, City, Country'), {
      target: { value: '9 Doi Rd' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Customer' }))
    await waitFor(() => expect(addCustomer).toHaveBeenCalledTimes(1))

    // Close the customer popup mid-save, drop this sale and start one on another lot.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close modal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    withdrawLot(1, 'GBL-2026-2')

    await act(async () => finishSave({ id: 'c-9', name: 'Hill', type: 'Roaster', address: '9 Doi Rd' }))

    // The saved customer is listed, but the other lot's sale stays unpicked.
    expect(onData.mock.lastCall![0].customers).toEqual([
      { id: 'c-9', name: 'Hill', type: 'Roaster', address: '9 Doi Rd' },
    ])
    expect(screen.getByRole('button', { name: 'Select customer...' })).toBeInTheDocument()
    expect(address().value).toBe('')
  })

  it('starts the next withdrawal without the last customer, address or price', () => {
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot], customers: [cafe] }}
        refreshData={async () => {}}
      />,
    )
    openSale()
    pick('Select customer...', 'Cafe Doi (Retailer)')
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    openSale()
    expect(screen.getByRole('button', { name: 'Select customer...' })).toBeInTheDocument()
    expect(address().value).toBe('')
    expect((screen.getByLabelText('Price per kg') as HTMLInputElement).value).toBe('')
  })
})

describe('Withdraw Stock roaster and total', { timeout: 20000 }, () => {
  const stockLot: GreenBeanLot = {
    id: 'gbl-1', displayId: 'GBL-2026-1', sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
    grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
    availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
  }
  const users = [
    { id: 'r-1', name: 'Hill Roastery', roles: [UserRole.Roaster] },
    { id: 'p-2', name: 'Other Processor', roles: [UserRole.Processor] },
  ]
  const form = () => screen.getByRole('button', { name: 'Save' }).closest('form')!
  const setAmount = (kg: string) =>
    fireEvent.change(form().querySelector('[name="amountKg"]')!, { target: { value: kg } })

  beforeEach(() => vi.clearAllMocks())

  it('requires a target roaster for Roasting Stock and sends it', async () => {
    vi.mocked(createWithdrawal).mockResolvedValue({ greenBeanLot: { ...stockLot, currentWeightKg: 35 } })
    render(
      <Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot], users }} refreshData={async () => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roast' }))
    setAmount('5')
    fireEvent.submit(form())
    expect(screen.getByText('กรุณาเลือก Roaster ที่ต้องการส่ง stock ให้')).toBeInTheDocument()
    expect(createWithdrawal).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Select Roaster...' }))
    expect(screen.queryByRole('button', { name: 'Other Processor' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hill Roastery' }))
    fireEvent.submit(form())

    await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(1))
    expect(createWithdrawal).toHaveBeenCalledWith('gbl-1', {
      amountKg: 5, withdrawalType: 'Roasting Stock', purpose: 'Roasting Stock', targetRoasterId: 'r-1',
    })
  })

  // The withdrawal answers with the bare stock row (no nested lot), and the
  // roaster's card reads grade, score, variety and process from the stored
  // row: storing it as sent showed "GRADE —" until the next refresh.
  describe('the roaster stock row a Roast fills keeps its lot details', () => {
    const parchment: ParchmentLot = {
      id: 'pl-1', displayId: 'PCH-2026-1', sourceType: ParchmentSourceType.Internal, harvestLotId: 'hl-1',
      initialWeightKg: 100, currentWeightKg: 0, moistureContent: 11, processType: 'Natural', status: 'Hulled',
    }
    const cherry: HarvestLot = { ...lot, id: 'hl-1', status: 'Complete', cherryVariety: 'Typica' }
    const sourceLot: GreenBeanLot = { ...stockLot, parchmentLotId: 'pl-1', processorScore: 86.5 }

    const roastFive = async (roasterInventory: AppData['roasterInventory'], onData: (data: AppData) => void) => {
      render(
        <Harness
          initial={{
            ...INITIAL_APP_DATA, users, greenBeanLots: [sourceLot], parchmentLots: [parchment],
            harvestLots: [cherry], roasterInventory,
          }}
          refreshData={async () => {}}
          onData={onData}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
      fireEvent.click(screen.getByRole('button', { name: 'Roast' }))
      setAmount('5')
      fireEvent.click(screen.getByRole('button', { name: 'Select Roaster...' }))
      fireEvent.click(screen.getByRole('button', { name: 'Hill Roastery' }))
      fireEvent.submit(form())
      await waitFor(() => expect(createWithdrawal).toHaveBeenCalledTimes(1))
    }

    const lotDetails = {
      greenBeanLotId: 'gbl-1', greenBeanDisplayId: 'GBL-2026-1', grade: 'Grade A', processorScore: 86.5,
      variety: 'Typica', process: 'Natural', withdrawalType: 'RoastingStock',
    }

    it('on a row the roaster already had', async () => {
      vi.mocked(createWithdrawal).mockResolvedValue({
        greenBeanLot: { ...sourceLot, currentWeightKg: 35 },
        roasterInventoryItem: { id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 15, remainingWeightKg: 12 },
      })
      const onData = vi.fn()
      await roastFive(
        [{
          id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 10, remainingWeightKg: 7,
          createdAt: '2026-09-30T03:00:00.000Z', grade: 'Grade A', variety: 'Typica',
        }],
        onData,
      )

      await waitFor(() => {
        const data: AppData = onData.mock.calls.at(-1)![0]
        expect(data.roasterInventory).toHaveLength(1)
        expect(data.roasterInventory[0]).toMatchObject({
          ...lotDetails, id: 'inv-1', claimedWeightKg: 15, remainingWeightKg: 12,
          createdAt: '2026-09-30T03:00:00.000Z',
        })
      })
      const data: AppData = onData.mock.calls.at(-1)![0]
      expect(data.greenBeanLots[0]).toMatchObject({ currentWeightKg: 35, grade: 'Grade A' })
    })

    it('on a new row', async () => {
      vi.mocked(createWithdrawal).mockResolvedValue({
        greenBeanLot: { ...sourceLot, currentWeightKg: 35 },
        roasterInventoryItem: { id: 'inv-2', roasterId: 'r-1', greenBeanLotId: 'gbl-1', claimedWeightKg: 5, remainingWeightKg: 5 },
      })
      const onData = vi.fn()
      await roastFive([], onData)

      await waitFor(() => {
        const data: AppData = onData.mock.calls.at(-1)![0]
        expect(data.roasterInventory).toEqual([
          expect.objectContaining({ ...lotDetails, id: 'inv-2', remainingWeightKg: 5 }),
        ])
      })
    })
  })

  it('shows the Sale total in the picked currency', () => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [stockLot] }} refreshData={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }))
    setAmount('5')
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '180.5' } })
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('902.50 THB')
    fireEvent.click(screen.getByRole('button', { name: 'THB' }))
    fireEvent.click(screen.getByRole('button', { name: 'USD' }))
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('902.50 USD')
  })
})

describe('Cherry lot edit and delete', { timeout: 20000 }, () => {
  const cherryLot: HarvestLot = {
    ...lot, farmId: 'farm-1', farmPlotLocation: 'Plot A', cropYearId: 'cy-2026',
    farm: { id: 'farm-1', farmName: 'Doi Farm' },
  }

  let confirmSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => confirmSpy.mockRestore())

  it('gives a super admin the edit and delete controls whatever roles the account lists', () => {
    // The sidebar and the route let a super admin in as an Admin, and the
    // backend lets them edit any lot, so the controls must be there too.
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={async () => {}} roles={[UserRole.Farmer]} isSuperAdmin />)
    expect(screen.getByRole('button', { name: 'Edit cherry lot HL-2026-44' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete cherry lot HL-2026-44' })).toBeInTheDocument()
  })

  it('gives no edit or delete controls to a role that may not change cherry lots', () => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={async () => {}} roles={[UserRole.Roaster]} />)
    expect(screen.queryByRole('button', { name: 'Edit cherry lot HL-2026-44' })).not.toBeInTheDocument()
  })

  it('edits a lot from its card and merges only the edited fields into the stored lot', async () => {
    // The PUT response is thinner than bulk-load (no farm summary here).
    vi.mocked(updateHarvestLotDetails).mockResolvedValue({
      ...cherryLot, farm: undefined, cherryVariety: 'Typica', weightKg: 385, harvestDate: '2026-09-14',
    })
    const onData = vi.fn()
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={async () => {}} onData={onData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit cherry lot HL-2026-44' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit cherry lot' })
    fireEvent.change(within(dialog).getByLabelText('Variety'), { target: { value: 'Typica' } })
    fireEvent.change(within(dialog).getByLabelText('Weight (kg)'), { target: { value: '385' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit cherry lot' })).not.toBeInTheDocument())
    // Only the changed fields go to the backend.
    expect(updateHarvestLotDetails).toHaveBeenCalledWith('hl-f442', {
      cherryVariety: 'Typica', weightKg: 385,
    })
    expect(screen.getByText('385.00 kg')).toBeInTheDocument()
    // onData fires from an effect, so the stored copy can lag the screen by a tick.
    await waitFor(() => expect(onData.mock.lastCall![0].harvestLots[0]).toMatchObject({
      cherryVariety: 'Typica', weightKg: 385, harvestDate: '2026-09-14',
      farmerName: 'Farmer', farmId: 'farm-1', cropYearId: 'cy-2026', status: 'Ready for Processing',
    }))
    expect(onData.mock.lastCall![0].harvestLots[0].farm).toEqual({ id: 'farm-1', farmName: 'Doi Farm' })
  })

  it('deletes a lot from the data grid after confirming', async () => {
    vi.mocked(deleteHarvestLot).mockResolvedValue(undefined)
    const onData = vi.fn()
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={async () => {}} onData={onData} />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete cherry lot HL-2026-44' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('HL-2026-44'))
    await waitFor(() => expect(onData.mock.lastCall![0].harvestLots).toEqual([]))
    // The workbench always asks the backend to refuse a lot processed since
    // the list loaded, whoever is signed in.
    expect(deleteHarvestLot).toHaveBeenCalledWith('hl-f442', { ifUnprocessed: true })
    expect(screen.queryByRole('button', { name: 'Record Process' })).not.toBeInTheDocument()
  })

  it('keeps the lot when the delete is not confirmed', () => {
    confirmSpy.mockReturnValue(false)
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete cherry lot HL-2026-44' }))
    expect(deleteHarvestLot).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Record Process' })).toBeInTheDocument()
  })

  it('keeps the lot and raises the error when the delete is refused', async () => {
    vi.mocked(deleteHarvestLot).mockRejectedValue(new Error("You don't have permission to delete harvest lot."))
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    const refreshData = vi.fn(async () => {})
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={refreshData} withToasts />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete cherry lot HL-2026-44' }))

    expect(await screen.findByText("You don't have permission to delete harvest lot.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Process' })).toBeInTheDocument()
    expect(refreshData).not.toHaveBeenCalled()
  })

  it.each([
    ['processed elsewhere (409)', 'This cherry lot has already been processed, so it was not deleted'],
    ['already deleted (404)', 'Resource not found while trying to delete harvest lot.'],
  ])('reloads the lots when the delete is refused because the lot was %s', async (_label, message) => {
    vi.mocked(deleteHarvestLot).mockRejectedValue(new Error(message))
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    const refreshData = vi.fn(async () => {})
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={refreshData} withToasts />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete cherry lot HL-2026-44' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(refreshData).toHaveBeenCalledTimes(1)
  })

  it('closes the edit and reloads the lots when the lot was processed elsewhere', async () => {
    const message = 'This cherry lot has already been processed, so a processor can no longer edit it'
    vi.mocked(updateHarvestLotDetails).mockRejectedValue(new Error(message))
    const refreshData = vi.fn(async () => {})
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={refreshData} withToasts />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit cherry lot HL-2026-44' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit cherry lot' })
    fireEvent.change(within(dialog).getByLabelText('Weight (kg)'), { target: { value: '385' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(refreshData).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Edit cherry lot' })).not.toBeInTheDocument()
  })

  it.each(['Workflow', 'Data Grid'])('in %s moves back a page when the last lot on the last page is deleted', async (view) => {
    vi.mocked(deleteHarvestLot).mockResolvedValue(undefined)
    // Six lots at five per page; the oldest sits alone on page 2.
    const lots = Array.from({ length: 6 }, (_, i) => ({
      ...cherryLot, id: `hl-${i + 1}`, displayId: `HL-2026-${i + 1}`, createdAt: `2026-09-0${i + 1}T00:00:00.000Z`,
    }))
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: lots }} refreshData={async () => {}} />)
    if (view === 'Data Grid') fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getAllByRole('button', { name: 'Record Process' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete cherry lot HL-2026-1' }))

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Record Process' })).toHaveLength(5))
    expect(screen.queryByRole('button', { name: 'Delete cherry lot HL-2026-1' })).not.toBeInTheDocument()
  })

  it.each([
    ['Workflow', [UserRole.Admin], true],
    ['Data Grid', [UserRole.Admin], true],
    ['Workflow', [UserRole.Roaster], false],
    ['Data Grid', [UserRole.Roaster], false],
  ])('in %s shows the actions for %j: %s', (view, roles, visible) => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, harvestLots: [cherryLot] }} refreshData={async () => {}} roles={roles} />)
    if (view === 'Data Grid') fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    const edit = screen.queryByRole('button', { name: 'Edit cherry lot HL-2026-44' })
    const del = screen.queryByRole('button', { name: 'Delete cherry lot HL-2026-44' })
    if (visible) {
      expect(edit).toBeInTheDocument()
      expect(del).toBeInTheDocument()
    } else {
      expect(edit).not.toBeInTheDocument()
      expect(del).not.toBeInTheDocument()
    }
  })
})

describe('Hull & Grade price', { timeout: 20000 }, () => {
  // The signed-in processor's own lot: Hull & Grade is offered only on a
  // parchment lot whose batch they recorded (or to an Admin).
  const ownBatch = {
    id: 'pb-own', harvestLotId: 'hl-own', processType: 'Washed', createdById: 'processor',
    status: ProcessingBatchStatus.Completed, parchmentWeightKg: 100,
  }
  const parchment: ParchmentLot = {
    id: 'pl-1', displayId: 'PL-2026-3', sourceType: ParchmentSourceType.Internal,
    processingBatchId: 'pb-own',
    initialWeightKg: 100, currentWeightKg: 100, moistureContent: 11,
    processType: 'Washed', status: 'AwaitingHulling', withdrawalHistory: [],
  }
  const hullData: AppData = { ...INITIAL_APP_DATA, parchmentLots: [parchment], processingBatches: [ownBatch] }

  // Text queries rather than getByRole: role queries over the whole
  // workbench are slow enough to push the suite's timeouts.
  const openHull = () => {
    fireEvent.click(screen.getByText('Hull & Grade', { selector: 'button' }))
    return screen.getByText('Save', { selector: 'button' }).closest('form')!
  }
  const saveButton = () => screen.getByText('Save', { selector: 'button' })
  const weight = (row: number) => screen.getByLabelText(`Weight (kg), row ${row}`)
  const price = (row: number) => screen.getByLabelText(`Price per kg in THB (optional), row ${row}`)
  // The "12,500.00 THB value" line under the kg total.
  const valueLine = (form: HTMLElement) => within(form).queryByText(/^[\d,]+\.\d{2} THB$/)
  const addGrade = (form: HTMLElement, grade: string) => {
    fireEvent.click(within(form).getByText('Add Grade', { selector: 'button' }))
    fireEvent.click(within(form).getAllByText('Select grade').at(-1)!.closest('button')!)
    fireEvent.click(within(form).getByText(grade, { selector: 'button' }))
  }
  const gbl = (id: string, displayId: string, grade: string, kg: number, price?: number): GreenBeanLot => ({
    id, displayId, sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
    parchmentLotId: 'pl-1', grade, initialWeightKg: kg, currentWeightKg: kg,
    availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
    ...(price !== undefined && {
      pricePerKg: price, currency: 'THB', priceSetDate: '2026-09-27', priceSetBy: 'processor',
    }),
  })

  // A successful save scrolls to the green bean stock 100 ms after closing;
  // jsdom has no scrollIntoView, so give it one (left in place: the timer
  // can outlive a test by a tick).
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('puts an optional THB price input directly after the weight on every row', () => {
    render(<Harness initial={hullData} refreshData={async () => {}} />)
    const form = openHull()
    addGrade(form, 'Grade B')

    // Form controls in tab order: the one right after each weight is its price.
    const controls = Array.from(form.querySelectorAll('input, button, select, textarea'))
    for (const row of [1, 2]) {
      const input = price(row) as HTMLInputElement
      expect(controls[controls.indexOf(weight(row)) + 1]).toBe(input)
      expect(input).toHaveAttribute('inputmode', 'decimal')
      expect(input).toHaveAttribute('placeholder', 'Optional')
      expect(input.value).toBe('')
      expect(input.parentElement).toHaveTextContent('THB')
    }
    // The column header on wide screens, plus a label per row for phones;
    // every one of them says the price is optional.
    expect(within(form).getAllByText('(optional)')).toHaveLength(3)
    for (const hint of within(form).getAllByText('(optional)')) {
      expect(hint.parentElement).toHaveTextContent('Price / kg (optional)')
    }
  })

  it('sends a typed price as gradedLots[i].price, closes before the reload, and shows the priced lots on their cards', async () => {
    vi.mocked(createParchmentWithdrawal).mockResolvedValue({
      parchmentLot: { ...parchment, currentWeightKg: 0, status: 'Hulled' },
      greenBeanLots: [
        gbl('gbl-new-1', 'GBL-2026-40', 'Grade A', 50, 250),
        gbl('gbl-new-2', 'GBL-2026-41', 'Grade B', 30),
      ],
    })
    const onData = vi.fn()
    // Keep the reload pending: the lots must come from the save response.
    const refreshData = vi.fn(() => new Promise<void>(() => {}))
    render(<Harness initial={hullData} refreshData={refreshData} onData={onData} />)
    const form = openHull()
    addGrade(form, 'Grade B')
    fireEvent.change(weight(1), { target: { value: '50' } })
    fireEvent.change(price(1), { target: { value: '250' } })
    fireEvent.change(weight(2), { target: { value: '30' } })
    expect(valueLine(form)).toHaveTextContent('12,500.00 THB value · 1 of 2 grades priced')
    fireEvent.submit(form)

    await waitFor(() => expect(createParchmentWithdrawal).toHaveBeenCalledTimes(1))
    const [lotId, payload] = vi.mocked(createParchmentWithdrawal).mock.calls[0]
    expect(lotId).toBe('pl-1')
    expect(payload).toMatchObject({ withdrawalType: 'HullAndGrade', totalGreenBeanWeight: 80 })
    expect(payload.gradedLots![0]).toMatchObject({ grade: 'Grade A', weight: 50, price: 250 })
    expect(payload.gradedLots![1]).toMatchObject({ grade: 'Grade B', weight: 30 })
    expect(payload.gradedLots![1]).not.toHaveProperty('price')

    // The popup closes while the reload is still pending, and the new lots
    // are already on screen: priced on one card, "Set price" on the other.
    await waitFor(() => expect(screen.queryByText('Save', { selector: 'button' })).not.toBeInTheDocument())
    expect(refreshData).toHaveBeenCalledTimes(1)
    expect(screen.getByText('250.00 THB/kg')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit price of GBL-2026-40')).toBeInTheDocument()
    expect(screen.getByLabelText('Set price of GBL-2026-41')).toBeInTheDocument()

    await waitFor(() => expect(onData.mock.lastCall![0].greenBeanLots).toHaveLength(2))
    const stored = onData.mock.lastCall![0] as AppData
    expect(stored.greenBeanLots.find((g) => g.id === 'gbl-new-1')).toMatchObject({ pricePerKg: 250, currency: 'THB' })
    expect(stored.greenBeanLots.find((g) => g.id === 'gbl-new-2')!.pricePerKg).toBeUndefined()
    expect(stored.parchmentLots[0]).toMatchObject({ id: 'pl-1', currentWeightKg: 0, status: 'Hulled' })
  }, 20000)

  it('keeps each price with its own grade after a middle row is removed', async () => {
    vi.mocked(createParchmentWithdrawal).mockResolvedValue({
      parchmentLot: { ...parchment, currentWeightKg: 0, status: 'Hulled' },
      greenBeanLots: [],
    })
    render(<Harness initial={hullData} refreshData={async () => {}} />)
    const form = openHull()
    addGrade(form, 'Grade B')
    addGrade(form, 'Grade C')
    for (const [row, kg, thb] of [[1, '50', '100'], [2, '20', '200'], [3, '30', '300']] as const) {
      fireEvent.change(weight(row), { target: { value: kg } })
      fireEvent.change(price(row), { target: { value: thb } })
    }
    fireEvent.click(within(form).getByLabelText('Remove row 2'))
    expect((price(2) as HTMLInputElement).value).toBe('300')
    fireEvent.submit(form)

    await waitFor(() => expect(createParchmentWithdrawal).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createParchmentWithdrawal).mock.calls[0][1]
    expect(payload.gradedLots!.map(({ grade, weight: kg, price: thb }) => ({ grade, kg, thb }))).toEqual([
      { grade: 'Grade A', kg: 50, thb: 100 },
      { grade: 'Grade C', kg: 30, thb: 300 },
    ])
  }, 20000)

  it('flags a price of 0, -1, abc or 1.234 on its row, blocks Save, and shows no value until a price is valid', () => {
    render(<Harness initial={hullData} refreshData={async () => {}} />)
    const form = openHull()
    const save = saveButton()
    fireEvent.change(weight(1), { target: { value: '80' } })
    // No price is fine: Save is open and no value is shown.
    expect(save).toBeEnabled()
    expect(valueLine(form)).not.toBeInTheDocument()

    for (const [typed, message] of [
      ['0', 'Must be more than 0'],
      ['-1', 'Must be more than 0'],
      ['abc', 'Numbers only, e.g. 1200.50'],
      ['1.234', 'Max 2 decimals'],
    ]) {
      fireEvent.change(price(1), { target: { value: typed } })
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(price(1)).toHaveAttribute('aria-invalid', 'true')
      expect(save).toBeDisabled()
      expect(form).not.toHaveTextContent('Ready to confirm')
      expect(valueLine(form)).not.toBeInTheDocument()
      fireEvent.submit(form)
    }
    expect(createParchmentWithdrawal).not.toHaveBeenCalled()

    fireEvent.change(price(1), { target: { value: '180.5' } })
    expect(save).toBeEnabled()
    expect(form).toHaveTextContent('Ready to confirm')
    expect(valueLine(form)).toHaveTextContent('14,440.00 THB value')
    expect(valueLine(form)).not.toHaveTextContent('grades priced')
  })
})

describe('Hull & Grade for the lot\'s processor only', { timeout: 20000 }, () => {
  // POST /parchment-lots/:id/withdrawals lets only the batch's processor, or
  // an Admin, hull a parchment lot (bought-in parchment is Admin-only). A
  // lot the viewer may not hull is listed without the button, not refused
  // with a 403. Text queries keep the whole-workbench render fast.
  const batchBy = (id: string, createdById: string) => ({
    id, harvestLotId: `hl-${id}`, processType: 'Washed', createdById,
    status: ProcessingBatchStatus.Completed, parchmentWeightKg: 100,
  })
  const parchmentOf = (id: string, displayId: string, processingBatchId?: string): ParchmentLot => ({
    id, displayId, processingBatchId,
    sourceType: processingBatchId ? ParchmentSourceType.Internal : ParchmentSourceType.External,
    initialWeightKg: 100, currentWeightKg: 100, moistureContent: 11,
    processType: 'Washed', status: 'AwaitingHulling', withdrawalHistory: [],
  })
  const data: AppData = {
    ...INITIAL_APP_DATA,
    processingBatches: [batchBy('pb-mine', 'processor'), batchBy('pb-theirs', 'p-2')],
    parchmentLots: [
      parchmentOf('pl-mine', 'PL-MINE', 'pb-mine'),
      parchmentOf('pl-theirs', 'PL-THEIRS', 'pb-theirs'),
      parchmentOf('pl-bought', 'PL-BOUGHT'),
    ],
  }
  const hullButtons = () => screen.queryAllByText('Hull & Grade', { selector: 'button' })
  // The workflow card or data grid row that holds this lot's id.
  const holderOf = (displayId: string) => {
    let el: HTMLElement | null = screen.getByText(displayId)
    while (el && !el.matches('tr, .border-l-4')) el = el.parentElement
    return el!
  }
  const hasHull = (displayId: string) =>
    within(holderOf(displayId)).queryByText('Hull & Grade', { selector: 'button' }) !== null

  beforeEach(() => vi.clearAllMocks())

  it.each(['Workflow', 'Data Grid'])('a Processor gets it on their own lot only, in %s', (view) => {
    render(<Harness initial={data} refreshData={async () => {}} />)
    if (view === 'Data Grid') fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    expect(hullButtons()).toHaveLength(1)
    expect(hasHull('PL-MINE')).toBe(true)
    expect(hasHull('PL-THEIRS')).toBe(false)
    expect(hasHull('PL-BOUGHT')).toBe(false)
  })

  it('a Processor who also roasts still gets it on their own lot only', () => {
    render(<Harness initial={data} refreshData={async () => {}} roles={[UserRole.Processor, UserRole.Roaster]} />)
    expect(hullButtons()).toHaveLength(1)
    expect(hasHull('PL-MINE')).toBe(true)
  })

  it.each([
    ['an Admin', [UserRole.Admin], false],
    ['a super admin', [UserRole.Processor], true],
  ] as const)('%s gets it on every lot, bought-in parchment included', (_label, roles, isSuperAdmin) => {
    render(<Harness initial={data} refreshData={async () => {}} roles={[...roles]} isSuperAdmin={isSuperAdmin} />)
    for (const view of ['Workflow', 'Data Grid']) {
      if (view === 'Data Grid') fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
      expect(hullButtons()).toHaveLength(3)
      for (const id of ['PL-MINE', 'PL-THEIRS', 'PL-BOUGHT']) expect(hasHull(id)).toBe(true)
    }
  })

  it('opens the Hull & Grade popup for the owner', () => {
    render(<Harness initial={data} refreshData={async () => {}} />)
    fireEvent.click(within(holderOf('PL-MINE')).getByText('Hull & Grade', { selector: 'button' }))
    expect(screen.getByText('Save', { selector: 'button' })).toBeInTheDocument()
  })
})

describe('Process type colours', { timeout: 20000 }, () => {
  const processType = (name: string, hue: string, isActive = true): ProcessType => ({
    id: `pt-${name}`, name, createdDate: '2026-09-01', isActive,
    colorScheme: {
      borderColor: `border-l-${hue}-500`, iconBg: `bg-${hue}-100`, iconColor: `text-${hue}-600`,
      badgeColor: `bg-${hue}-100 text-${hue}-700 border-${hue}-200`,
    },
  })
  const processTypes = [
    processType('Natural', 'yellow'), processType('Washed', 'blue'),
    processType('Honey', 'amber', false), processType('Anaerobic', 'purple'),
  ]
  const parchment = (id: string, displayId: string, type: string): ParchmentLot => ({
    id, displayId, sourceType: ParchmentSourceType.Internal,
    initialWeightKg: 50, currentWeightKg: 40, moistureContent: 11,
    processType: type, status: 'AwaitingHulling', withdrawalHistory: [],
  })
  const chipGroup = () => document.querySelector('[role="group"][aria-label="Process type"]') as HTMLElement

  beforeEach(() => vi.clearAllMocks())

  it('Record Process offers the active admin types as chips and sends the picked name', async () => {
    vi.mocked(addProcessingBatch).mockResolvedValue({ ...batch, processType: 'Anaerobic' })
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, harvestLots: [lot], processTypes }}
        refreshData={() => new Promise<void>(() => {})}
      />,
    )
    fireEvent.click(screen.getByText('Record Process', { selector: 'button' }))

    const chips = within(chipGroup()).getAllByRole('button')
    expect(chips.map((b) => b.textContent)).toEqual(['Natural', 'Washed', 'Anaerobic'])
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    expect(chips[0]).toHaveClass('bg-yellow-700', 'text-white')
    fireEvent.click(chips[2])
    expect(chips[2]).toHaveAttribute('aria-pressed', 'true')
    expect(chips[2]).toHaveClass('bg-purple-600')

    const form = chipGroup().closest('form')!
    expect(form.querySelector<HTMLInputElement>('input[name="processType"]')!.value).toBe('Anaerobic')
    fireEvent.change(form.querySelector('[name="parchmentWeightKg"]')!, { target: { value: '80' } })
    fireEvent.change(form.querySelector('[name="moistureContent"]')!, { target: { value: '11' } })
    fireEvent.submit(form)

    await waitFor(() => expect(addProcessingBatch).toHaveBeenCalledTimes(1))
    expect(addProcessingBatch).toHaveBeenCalledWith(expect.objectContaining({ processType: 'Anaerobic' }))
  })

  it('colours the data grid pills with the admin colour and filters by any admin type', () => {
    render(
      <Harness
        initial={{
          ...INITIAL_APP_DATA, processTypes,
          parchmentLots: [
            parchment('pl-a', 'PL-2026-1', 'Anaerobic'),
            parchment('pl-w', 'PL-2026-2', 'Washed'),
            parchment('pl-x', 'PL-2026-3', 'Wet-Hulled'),
          ],
        }}
        refreshData={async () => {}}
      />,
    )
    fireEvent.click(screen.getByText('Data Grid').closest('button')!)
    const section = screen.getByText('2 · Parchment Stock').closest('div.shadow-sm') as HTMLElement
    const rowOf = (displayId: string) => within(section).getByText(displayId).closest('tr') as HTMLElement
    expect(within(rowOf('PL-2026-1')).getByText('Anaerobic')).toHaveClass('bg-purple-100', 'text-purple-700', 'border-purple-200')
    expect(within(rowOf('PL-2026-2')).getByText('Washed')).toHaveClass('bg-blue-100', 'text-blue-700')
    expect(within(rowOf('PL-2026-3')).getByText('Wet-Hulled')).toHaveClass('bg-gray-100')

    // The process filter lists every admin type and other values on the lots.
    const select = within(section).getByText('All Process').closest('div.relative') as HTMLElement
    fireEvent.click(within(select).getByText('All Process'))
    const options = within(select).getAllByRole('button').map((b) => b.textContent).filter((t) => t !== 'All Process')
    expect(options).toEqual(expect.arrayContaining(['Natural', 'Washed', 'Honey', 'Anaerobic', 'Wet-Hulled']))
    fireEvent.click(within(select).getByText('Anaerobic', { selector: 'button' }))
    expect(within(section).getByText('PL-2026-1')).toBeInTheDocument()
    expect(within(section).queryByText('PL-2026-2')).not.toBeInTheDocument()
  })

  it('Record Process starts on Washed, as before, while the admin list is empty', async () => {
    vi.mocked(addProcessingBatch).mockResolvedValue(batch)
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, harvestLots: [lot] }}
        refreshData={() => new Promise<void>(() => {})}
      />,
    )
    fireEvent.click(screen.getByText('Record Process', { selector: 'button' }))

    expect(within(chipGroup()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Honey', 'Natural', 'Washed'])
    expect(within(chipGroup()).getByRole('button', { name: 'Washed' })).toHaveAttribute('aria-pressed', 'true')
    const form = chipGroup().closest('form')!
    expect(form.querySelector<HTMLInputElement>('input[name="processType"]')!.value).toBe('Washed')
    fireEvent.change(form.querySelector('[name="parchmentWeightKg"]')!, { target: { value: '80' } })
    fireEvent.change(form.querySelector('[name="moistureContent"]')!, { target: { value: '11' } })
    fireEvent.submit(form)

    await waitFor(() => expect(addProcessingBatch).toHaveBeenCalledTimes(1))
    expect(addProcessingBatch).toHaveBeenCalledWith(expect.objectContaining({ processType: 'Washed' }))
  })

  it('edges each workflow parchment card in its process-type colour, gray once hulled', () => {
    render(
      <Harness
        initial={{
          ...INITIAL_APP_DATA, processTypes,
          parchmentLots: [
            parchment('pl-a', 'PL-2026-1', 'Anaerobic'),
            parchment('pl-x', 'PL-2026-3', 'Wet-Hulled'),
            { ...parchment('pl-h', 'PL-2026-4', 'Washed'), status: 'Hulled' },
          ],
        }}
        refreshData={async () => {}}
      />,
    )
    const column = screen.getByText('2 · Parchment Stock').closest('div.shadow-sm') as HTMLElement
    const cardOf = (displayId: string) => within(column).getByText(displayId).closest('.border-l-4') as HTMLElement
    // Not the old fixed amber stage edge, which is now Honey's colour.
    expect(cardOf('PL-2026-1')).toHaveClass('border-l-purple-500')
    expect(cardOf('PL-2026-1')).not.toHaveClass('border-l-amber-500')
    expect(cardOf('PL-2026-3')).toHaveClass('border-l-gray-400')
    expect(cardOf('PL-2026-4')).toHaveClass('border-l-gray-300')
    expect(cardOf('PL-2026-4')).not.toHaveClass('border-l-blue-500')
  })

  it('lets a long process name wrap on the narrow workflow parchment card', () => {
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, processTypes, parchmentLots: [parchment('pl-a', 'PL-2026-1', 'Anaerobic')] }}
        refreshData={async () => {}}
      />,
    )
    const column = screen.getByText('2 · Parchment Stock').closest('div.shadow-sm') as HTMLElement
    const pill = within(column).getByText('Anaerobic')
    expect(pill).toHaveClass('bg-purple-100', 'text-purple-700', 'border-purple-200', 'break-words', 'min-w-0')
    expect(pill).not.toHaveClass('whitespace-nowrap')
    // The label beside it keeps its width; the pill is the part that wraps.
    expect(within(pill.parentElement!).getByText('Process')).toHaveClass('flex-shrink-0')
  })

  it('shows the source parchment process in neutral text beside its colour dot', () => {
    const green: GreenBeanLot = {
      id: 'gbl-1', displayId: 'GBL-2026-1', sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
      parchmentLotId: 'pl-w', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
      availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
    }
    render(
      <Harness
        initial={{
          ...INITIAL_APP_DATA, processTypes,
          parchmentLots: [{ ...parchment('pl-w', 'PL-2026-2', 'Washed'), currentWeightKg: 0, status: 'Hulled' }],
          greenBeanLots: [green],
        }}
        refreshData={async () => {}}
      />,
    )
    fireEvent.click(screen.getAllByTitle('Source')[0])
    const modal = screen.getByText('Green Bean Source').closest('div.rounded-2xl') as HTMLElement
    const processLine = within(modal).getByText('Process').nextElementSibling as HTMLElement
    expect(processLine).toHaveTextContent('Washed')
    expect(processLine).toHaveClass('text-gray-900')
    expect(processLine).not.toHaveClass('text-amber-700')
    expect(processLine.querySelector('span.rounded-full')).toHaveClass('bg-blue-500')
  })
})

describe('QC Score', { timeout: 20000 }, () => {
  const scoredLot = (score?: number): GreenBeanLot => ({
    id: 'gbl-1', displayId: 'GBL-2026-1', sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
    grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
    availabilityStatus: 'Available', withdrawalHistory: [],
    cuppingScores: score === undefined ? [] : [{ sessionId: 'CS-QC-processor', score }],
  })
  // The processor's own QC session holding one stored score for gbl-1.
  const qcSession = (scores: Record<string, number>, totalScore: number, notes: string): CuppingSession => ({
    id: 'CS-QC-processor', name: "Processor's Internal QC", date: '2026-09-01',
    type: CuppingSessionType.QC, status: 'Finalized',
    judges: [{ id: 'processor', name: 'Processor', role: UserRole.Processor }],
    samples: [{
      id: 'S1', blindCode: 'gbl-1', greenBeanLotId: 'gbl-1',
      submitterInfo: { name: 'Farmer' }, originInfo: { farm: 'N/A' }, lotInfo: { process: 'Washed' },
    }],
    scores: { S1: [{ judgeId: 'processor', judgeName: 'Processor', scores, notes, totalScore }] },
  })
  const openQcScore = () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'QC Score' })[0])
    return screen.getByRole('heading', { name: 'QC Score' }).closest('div.rounded-2xl') as HTMLElement
  }
  const currentScore = (modal: HTMLElement) =>
    within(modal).getByText('Current Score').nextElementSibling as HTMLElement

  beforeEach(() => vi.clearAllMocks())

  it('opens straight on the SCA form with no Simple Score option', () => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [scoredLot()] }} refreshData={async () => {}} />)
    const modal = openQcScore()

    for (const attr of SCA_SENSORY_ATTRIBUTES) {
      expect(within(modal).getByLabelText(attr)).toHaveValue(null)
    }
    expect(within(modal).getByText('Final Score')).toBeInTheDocument()
    expect(within(modal).queryByText('Simple Score')).not.toBeInTheDocument()
    expect(within(modal).queryByText('Detailed (SCA)')).not.toBeInTheDocument()
    expect(within(modal).queryByText('Total Score (0-100)')).not.toBeInTheDocument()
    expect(within(modal).getByRole('button', { name: 'Save Score' })).toBeInTheDocument()
    expect(within(modal).getByText('Tasting Notes & Comments')).toBeInTheDocument()
  })

  it('saves the detailed SCA scores, total and per-attribute fields', async () => {
    vi.mocked(updateGreenBeanLotScore).mockResolvedValue(scoredLot(86))
    const onData = vi.fn()
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [scoredLot()] }}
        refreshData={async () => {}}
        onData={onData}
      />,
    )
    const modal = openQcScore()
    for (const attr of SCA_SENSORY_ATTRIBUTES) {
      fireEvent.change(within(modal).getByLabelText(attr), { target: { value: '8' } })
    }
    fireEvent.change(within(modal).getByPlaceholderText(/Describe flavor notes/), { target: { value: 'Stone fruit' } })
    // 7 x 8 sensory + 3 x 10 cups, no defects.
    expect(within(modal).getByText('Final Score').nextElementSibling).toHaveTextContent('86.00')
    fireEvent.click(within(modal).getByRole('button', { name: 'Save Score' }))

    await waitFor(() => expect(updateGreenBeanLotScore).toHaveBeenCalledTimes(1))
    // The Tasting Notes & Comments go to the server with the score (qcNotes).
    expect(updateGreenBeanLotScore).toHaveBeenCalledWith('gbl-1', 86, {
      cuppingFragrance: 8, cuppingFlavor: 8, cuppingAftertaste: 8, cuppingAcidity: 8,
      cuppingBody: 8, cuppingBalance: 8, cuppingOverall: 8,
      cuppingUniformity: 10, cuppingCleanCup: 10, cuppingSweetness: 10,
    }, 'Stone fruit')
    expect(screen.queryByRole('heading', { name: 'QC Score' })).not.toBeInTheDocument()

    await waitFor(() => expect(onData.mock.lastCall![0].greenBeanLots[0].processorScore).toBe(86))
    const stored = onData.mock.lastCall![0].cuppingSessions[0].scores.S1[0]
    expect(stored).toMatchObject({ judgeId: 'processor', notes: 'Stone fruit', totalScore: 86 })
    expect(Object.keys(stored.scores)).toHaveLength(10)
    expect(stored.scores).toMatchObject({ 'Fragrance/Aroma': 8, Overall: 8, 'Clean Cup': 10 })
  })

  it('opens an old one-number Simple score on an empty SCA form and keeps its total in the header', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(
      <Harness
        initial={{
          ...INITIAL_APP_DATA,
          greenBeanLots: [scoredLot(84)],
          cuppingSessions: [qcSession({ Overall: 84 }, 84, 'Old simple note')],
        }}
        refreshData={async () => {}}
      />,
    )
    const modal = openQcScore()

    // The 84 total is not read as the 1-10 Overall attribute.
    for (const attr of SCA_SENSORY_ATTRIBUTES) {
      expect(within(modal).getByLabelText(attr)).toHaveValue(null)
    }
    expect(within(modal).getByPlaceholderText(/Describe flavor notes/)).toHaveValue('Old simple note')
    expect(currentScore(modal)).toHaveTextContent('84.00')
    expect(within(modal).queryByText('Simple Score')).not.toBeInTheDocument()

    // Saving the empty form is refused; the old score is not overwritten.
    fireEvent.click(within(modal).getByRole('button', { name: 'Save Score' }))
    expect(alert).toHaveBeenCalledWith('Please correct the errors in the detailed scores.')
    expect(updateGreenBeanLotScore).not.toHaveBeenCalled()
    alert.mockRestore()
  })

  it('prefills a stored detailed score as before', () => {
    const scores = {
      'Fragrance/Aroma': 8.5, Flavor: 8, Aftertaste: 7.75, Acidity: 8, Body: 7.5, Balance: 8, Overall: 8,
      Uniformity: 10, 'Clean Cup': 8, Sweetness: 10,
    }
    render(
      <Harness
        initial={{
          ...INITIAL_APP_DATA,
          greenBeanLots: [scoredLot(83.75)],
          cuppingSessions: [qcSession(scores, 83.75, 'Detailed note')],
        }}
        refreshData={async () => {}}
      />,
    )
    const modal = openQcScore()

    expect(within(modal).getByLabelText('Fragrance/Aroma')).toHaveValue(8.5)
    expect(within(modal).getByLabelText('Aftertaste')).toHaveValue(7.75)
    expect(within(modal).getByLabelText('Overall')).toHaveValue(8)
    expect(within(modal).getByPlaceholderText(/Describe flavor notes/)).toHaveValue('Detailed note')
    // Clean Cup 8 = four good cups; the form total matches the stored one.
    expect(within(modal).getByText('Clean Cup').nextElementSibling).toHaveTextContent('8')
    expect(within(modal).getByText('Final Score').nextElementSibling).toHaveTextContent('83.75')
  })

  // The notes used to live only in the in-browser QC session, so they were
  // gone after a reload. Now they are saved on the lot (qcNotes).
  it('prefills the notes saved on the lot when the browser holds no QC session', () => {
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [{ ...scoredLot(86), qcNotes: 'Saved on the server' }] }}
        refreshData={async () => {}}
      />,
    )
    const modal = openQcScore()

    expect(within(modal).getByPlaceholderText(/Describe flavor notes/)).toHaveValue('Saved on the server')
  })

  it('prefers the notes saved on the lot over the QC session copy', () => {
    render(
      <Harness
        initial={{
          ...INITIAL_APP_DATA,
          greenBeanLots: [{ ...scoredLot(84), qcNotes: 'Server note' }],
          cuppingSessions: [qcSession({ Overall: 84 }, 84, 'Browser note')],
        }}
        refreshData={async () => {}}
      />,
    )
    const modal = openQcScore()

    expect(within(modal).getByPlaceholderText(/Describe flavor notes/)).toHaveValue('Server note')
  })

  it('reopening QC Score after saving shows the saved notes, and emptied notes are sent to clear them', async () => {
    vi.mocked(updateGreenBeanLotScore).mockResolvedValue(scoredLot(86))
    const onData = vi.fn()
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, greenBeanLots: [scoredLot()] }}
        refreshData={async () => {}}
        onData={onData}
      />,
    )
    let modal = openQcScore()
    for (const attr of SCA_SENSORY_ATTRIBUTES) {
      fireEvent.change(within(modal).getByLabelText(attr), { target: { value: '8' } })
    }
    fireEvent.change(within(modal).getByPlaceholderText(/Describe flavor notes/), { target: { value: '  Honey, clean  ' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Save Score' }))
    await waitFor(() => expect(updateGreenBeanLotScore).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onData.mock.lastCall![0].greenBeanLots[0].qcNotes).toBe('Honey, clean'))

    modal = openQcScore()
    const notesBox = within(modal).getByPlaceholderText(/Describe flavor notes/)
    expect(notesBox).toHaveValue('Honey, clean')
    expect(notesBox).toHaveAttribute('maxLength', '2000')

    fireEvent.change(notesBox, { target: { value: '' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Save Score' }))
    await waitFor(() => expect(updateGreenBeanLotScore).toHaveBeenCalledTimes(2))
    expect(vi.mocked(updateGreenBeanLotScore).mock.calls[1][3]).toBe('')
  })
})

describe('Withdrawal history invoice', { timeout: 20000 }, () => {
  const saleLot = (sale: Record<string, unknown>): GreenBeanLot => ({
    id: 'gbl-1', displayId: 'GBL-2026-9', sourceType: GreenBeanSourceType.Internal, createdById: 'processor',
    grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 45,
    availabilityStatus: 'Available', cuppingScores: [],
    withdrawalHistory: [{ amountKg: 5, withdrawalType: 'Sale', purpose: 'Sale', date: '2026-09-20', ...sale }],
  })

  const openHistory = (lot: GreenBeanLot, roles?: UserRole[]) => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [lot] }} refreshData={async () => {}} roles={roles} />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'View Withdrawal History' }))
  }

  it("offers the invoice on the owner's sale", () => {
    openHistory(saleLot({ customerName: 'Cafe Doi', salePrice: 400, currency: 'THB', totalAmount: 2000 }))
    expect(screen.getByRole('button', { name: 'Invoice' })).toBeInTheDocument()
  })

  // Someone else's lot as the backend sends it: type, kg, date and who
  // recorded it, without the purpose or the sale columns.
  const hiddenSaleLot = (): GreenBeanLot => ({
    ...saleLot({}),
    createdById: 'p-2',
    withdrawalHistory: [{
      amountKg: 5, withdrawalType: 'Sale', date: '2026-09-20', withdrawnByName: 'Proc Two',
      saleDetailsHidden: true,
    }],
  })
  const historyModal = () =>
    screen.getByText('Withdrawal History', { selector: 'h2' }).closest('.rounded-2xl') as HTMLElement

  it("offers no invoice on a sale the backend withheld (someone else's lot)", () => {
    // Without the sale columns the invoice would be a blank INV-DRAFT at 0.00.
    openHistory(hiddenSaleLot())
    expect(screen.queryByRole('button', { name: 'Invoice' })).not.toBeInTheDocument()
  })

  it('shows a dash for the purpose the backend withheld with the sale', () => {
    // People type customer names and order numbers into the purpose, so only
    // the lot's owner and Admin get it.
    openHistory(hiddenSaleLot())
    const modal = historyModal()
    expect(within(modal).getByText('Purpose').nextElementSibling).toHaveTextContent(/^—$/)
    // The rest of the row still shows.
    expect(within(modal).getByText('5.00 kg')).toBeInTheDocument()
    expect(within(modal).getByText('Proc Two')).toBeInTheDocument()
    expect(within(modal).getByText('Sale', { selector: 'span' })).toBeInTheDocument()
    expect(modal).not.toHaveTextContent('undefined')
  })

  it("shows the purpose on the owner's own sale", () => {
    openHistory(saleLot({ purpose: 'Order 42 for Cafe Doi', customerName: 'Cafe Doi', salePrice: 400 }))
    expect(within(historyModal()).getByText('Purpose').nextElementSibling).toHaveTextContent('Order 42 for Cafe Doi')
  })

  // The invoice's QR opens the PUBLIC trace page. Creating that link from the
  // invoice must stick to the lot: a reopened invoice that offered the button
  // again would replace the id and break QR codes already printed.
  describe('public trace link', () => {
    const fullSale = { customerName: 'Cafe Doi', salePrice: 400, currency: 'THB', totalAmount: 2000, invoiceNumber: 'INV-7' }
    const createLinkButton = () => screen.queryByRole('button', { name: 'Create public trace link' })
    const openInvoice = () => fireEvent.click(screen.getByRole('button', { name: 'Invoice' }))
    // The invoice's close button is the icon-only one next to Print.
    const closeInvoice = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Print' }).nextElementSibling as HTMLElement)

    beforeEach(() => vi.clearAllMocks())

    it('keeps the link the owner created, so a reopened invoice shows the same QR', async () => {
      vi.mocked(generatePublicTraceId).mockResolvedValue({
        publicTraceId: 'pub-new',
        publicUrl: '/trace/pub-new',
        greenBeanLot: { id: 'gbl-1', publicTraceId: 'pub-new', qrGeneratedAt: '2026-10-05T00:00:00Z' },
      })
      const publicUrl = getPublicTraceUrl('pub-new')
      expect(publicUrl).toContain('/#/trace/pub-new')

      openHistory(saleLot(fullSale))
      openInvoice()
      fireEvent.click(createLinkButton() as HTMLElement)
      expect(await screen.findByText(publicUrl)).toBeInTheDocument()

      // The invoice's own state goes with it; only the stored lot carries the id.
      closeInvoice()
      expect(screen.queryByText(publicUrl)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'View Withdrawal History' }))
      openInvoice()

      expect(screen.getByText(publicUrl)).toBeInTheDocument()
      expect(await screen.findByRole('img', { name: 'Traceability QR' }))
        .toHaveAttribute('src', `data:image/png;qr,${encodeURIComponent(publicUrl)}`)
      expect(createLinkButton()).not.toBeInTheDocument()
      expect(screen.queryByText(/#\/traceability\//)).not.toBeInTheDocument()
      expect(generatePublicTraceId).toHaveBeenCalledTimes(1)
      expect(generatePublicTraceId).toHaveBeenCalledWith('gbl-1')
    })

    it("offers an Admin the link on someone else's lot", () => {
      // The backend sends an Admin the full sale on any lot.
      openHistory({ ...saleLot(fullSale), createdById: 'p-2' }, [UserRole.Admin])
      openInvoice()

      expect(createLinkButton()).toBeInTheDocument()
      expect(screen.queryByTestId('invoice-trace-unavailable')).not.toBeInTheDocument()
      expect(generatePublicTraceId).not.toHaveBeenCalled()
    })

    it('shows a Processor who does not own the lot a note instead of the button', () => {
      // Only the owner or an Admin may create the link (the endpoint returns
      // 403 otherwise), so the workbench must not pass a blanket yes.
      openHistory({ ...saleLot(fullSale), createdById: 'p-2' })
      openInvoice()

      expect(createLinkButton()).not.toBeInTheDocument()
      expect(screen.getByTestId('invoice-trace-unavailable')).toBeInTheDocument()
    })
  })
})

describe('Withdraw, Set price, QC Score and the availability switch only on lots the user may manage (F12)', { timeout: 20000 }, () => {
  const greenLot = (id: string, n: number, extra: Partial<GreenBeanLot>): GreenBeanLot => ({
    id, displayId: `GBL-2026-${n}`, sourceType: GreenBeanSourceType.Internal,
    grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
    availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [],
    ...extra,
  })
  const mine = greenLot('gbl-mine', 1, { createdById: 'processor' })
  const otherProcessors = greenLot('gbl-other', 2, { createdById: 'p-2' })
  const roasters = greenLot('gbl-roaster', 3, {
    createdById: 'r-1', sourceType: GreenBeanSourceType.External, pricePerKg: 300, currency: 'THB',
    externalSource: {
      originName: 'Doi Chang Co-op', variety: 'Catimor', processType: 'Washed',
      purchaseDate: '2026-07-30', pricePerKg: 300, currency: 'THB',
    },
  })
  const noCreator = greenLot('gbl-legacy', 4, {})
  const initial = { ...INITIAL_APP_DATA, greenBeanLots: [mine, otherProcessors, roasters, noCreator] }
  const others = [2, 3, 4]

  beforeEach(() => vi.clearAllMocks())

  it('a Processor gets them on their own lot only, in the workflow cards and the data grid', () => {
    render(<Harness initial={initial} refreshData={async () => {}} />)
    // Every lot is still listed; only the actions are left off.
    for (const n of [1, ...others]) {
      expect(screen.getAllByText(`GBL-2026-${n}`).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Set price of GBL-2026-1' })).toBeInTheDocument()
    for (const n of others) {
      expect(screen.queryByRole('button', { name: `Set price of GBL-2026-${n}` })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: `Edit price of GBL-2026-${n}` })).not.toBeInTheDocument()
    }
    // The roaster's price still shows, read-only.
    expect(screen.getByText(/300\.00 THB\/kg/)).toBeInTheDocument()

    // QC Score and the On sale / Hidden switch save through the same
    // owner-only routes: the other lots show their status, not a switch.
    expect(screen.getAllByRole('button', { name: 'QC Score' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'On sale' })).toHaveLength(1)
    expect(screen.getAllByText('On sale', { selector: 'span' })).toHaveLength(others.length)

    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Price' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'QC Score' })).toHaveLength(1)
  })

  it('a Processor gets QC Score, Price and Withdraw in the parchment\'s split history on their own lot only', () => {
    const parchment: ParchmentLot = {
      id: 'pl-1', displayId: 'PL-2026-3', sourceType: ParchmentSourceType.Internal,
      initialWeightKg: 100, currentWeightKg: 20, moistureContent: 11,
      processType: 'Washed', status: 'AwaitingHulling', withdrawalHistory: [],
    }
    const split = [
      { ...mine, parchmentLotId: 'pl-1' },
      { ...otherProcessors, parchmentLotId: 'pl-1' },
    ]
    render(<Harness initial={{ ...INITIAL_APP_DATA, parchmentLots: [parchment], greenBeanLots: split }} refreshData={async () => {}} />)

    fireEvent.click(screen.getByTitle('View history'))
    const popup = screen.getByText('Green Bean Split History').closest('div.rounded-2xl') as HTMLElement
    expect(within(popup).getByText('GBL-2026-2')).toBeInTheDocument()
    expect(within(popup).getAllByTitle('QC Score')).toHaveLength(1)
    expect(within(popup).getAllByTitle('Withdraw')).toHaveLength(1)
    expect(within(popup).getAllByText('Price', { selector: 'button' })).toHaveLength(1)
  })

  it('the Processor\'s own availability switch still works', async () => {
    vi.mocked(updateGreenBeanLotAvailability).mockResolvedValue({ ...mine, availabilityStatus: 'Withdrawn' })
    render(<Harness initial={initial} refreshData={async () => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'On sale' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hide lot' }))

    await waitFor(() => expect(updateGreenBeanLotAvailability).toHaveBeenCalledWith('gbl-mine', 'Withdrawn'))
    expect(await screen.findByRole('button', { name: 'Hidden' })).toBeInTheDocument()
  })

  describe('On sale / Hidden instead of Available / Withdrawn', () => {
    it('asks in a centred popup before hiding a lot that still has kg, and Keep on sale leaves it', () => {
      render(<Harness initial={initial} refreshData={async () => {}} />)
      const chip = screen.getByRole('button', { name: 'On sale' })
      expect(chip).toHaveAttribute('title', 'Hide this lot from sale')

      fireEvent.click(chip)
      const popup = screen.getByRole('dialog')
      expect(popup).toHaveTextContent('Hide GBL-2026-1 from sale?')
      expect(popup).toHaveTextContent('40.00 kg stay in stock')
      // The site popup, centred on the screen; not a drawer.
      expect(popup).toHaveClass('items-center', 'justify-center')

      fireEvent.click(within(popup).getByRole('button', { name: 'Keep on sale' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(updateGreenBeanLotAvailability).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'On sale' })).toBeInTheDocument()
    })

    it('puts a hidden lot back on sale without asking, and keeps the rest of the stored lot', async () => {
      const hidden: GreenBeanLot = { ...mine, availabilityStatus: 'Withdrawn', withdrawalHistory: [
        { amountKg: 10, withdrawalType: 'Sample', purpose: 'Sample', date: '2026-09-01' },
      ] }
      // The PUT answer is thinner than bulk-load: no withdrawal history.
      vi.mocked(updateGreenBeanLotAvailability).mockResolvedValue({ ...hidden, availabilityStatus: 'Available', withdrawalHistory: [] })
      const onData = vi.fn()
      render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [hidden] }} refreshData={async () => {}} onData={onData} />)

      const chip = screen.getByRole('button', { name: 'Hidden' })
      expect(chip).toHaveAttribute('title', 'Put this lot back on sale')
      // Withdraw is off while hidden, and says why.
      expect(screen.getByRole('button', { name: 'Withdraw' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveAttribute(
        'title', 'Hidden from sale: put the lot back on sale to withdraw',
      )

      fireEvent.click(chip)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(updateGreenBeanLotAvailability).toHaveBeenCalledWith('gbl-mine', 'Available'))
      expect(await screen.findByRole('button', { name: 'On sale' })).toBeInTheDocument()
      const stored: GreenBeanLot = onData.mock.calls.at(-1)![0].greenBeanLots[0]
      expect(stored.availabilityStatus).toBe('Available')
      expect(stored.withdrawalHistory).toHaveLength(1)
    })

    it('labels the data grid column the same way', () => {
      const hidden = { ...mine, availabilityStatus: 'Withdrawn' as const }
      render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [hidden, otherProcessors] }} refreshData={async () => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
      const table = screen.getByText('Availability', { selector: 'th' }).closest('table') as HTMLElement
      expect(within(table).getByText('Hidden')).toBeInTheDocument()
      expect(within(table).getByText('On sale')).toBeInTheDocument()
      expect(within(table).queryByText('Withdrawn')).not.toBeInTheDocument()
      expect(within(table).queryByText('Available')).not.toBeInTheDocument()
    })
  })

  it('the one Withdraw opens Withdraw Stock for the Processor\'s own lot', () => {
    render(<Harness initial={initial} refreshData={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(screen.getByText('Lot #GBL-2026-1')).toBeInTheDocument()
  })

  it.each([
    ['an Admin', [UserRole.Admin]],
    ['an Admin who is also a Processor', [UserRole.Processor, UserRole.Admin]],
  ])('%s gets them on every lot', (_who, roles) => {
    render(<Harness initial={initial} refreshData={async () => {}} roles={roles} />)
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(4)
    for (const n of [1, 2, 4]) {
      expect(screen.getByRole('button', { name: `Set price of GBL-2026-${n}` })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Edit price of GBL-2026-3' })).toBeInTheDocument()

    expect(screen.getAllByRole('button', { name: 'QC Score' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'On sale' })).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Price' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'QC Score' })).toHaveLength(4)
  })
})

// The prod case: PCH-2026-5 (16 kg) was hulled into GBL-2026-6 (8 kg) and
// GBL-2026-7 (4 kg). bulk-load sends parchment lots without their withdrawals,
// so the Edit green bean lot popup loads them to show the Hull & Grade limit
// before saving.
describe('Edit green bean lot: the Hull & Grade limit', { timeout: 20000 }, () => {
  const HULLED_AT = '2026-09-20T03:00:00.000Z'
  // As bulk-load stores it: no withdrawalHistory.
  const parchment: ParchmentLot = {
    id: 'pl-5', displayId: 'PCH-2026-5', sourceType: ParchmentSourceType.Internal, processingBatchId: 'pb-5',
    initialWeightKg: 16, currentWeightKg: 0, moistureContent: 11, processType: 'Washed', status: 'Hulled',
  }
  const greenLot = (n: number, kg: number, extra: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
    id: `gbl-${n}`, displayId: `GBL-2026-${n}`, sourceType: GreenBeanSourceType.Internal,
    parchmentLotId: 'pl-5', parchmentWithdrawalId: 'pw-hull', createdById: 'processor', grade: 'Grade A',
    initialWeightKg: kg, currentWeightKg: kg, availabilityStatus: 'Available', cuppingScores: [],
    withdrawalHistory: [], createdAt: '2026-09-20T03:00:01.000Z', ...extra,
  })
  const parchmentList = {
    parchmentLots: [{
      id: 'pl-5',
      withdrawalHistory: [
        { id: 'pw-hull', amountKg: 16, withdrawalType: 'HullAndGrade', purpose: 'Hull', date: HULLED_AT },
      ],
    }],
  }

  let getSpy: ReturnType<typeof vi.spyOn>
  let putSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    getSpy = vi.spyOn(api, 'get').mockImplementation((async (endpoint: string) =>
      endpoint === '/parchment-lots' ? parchmentList : {}) as typeof api.get)
    putSpy = vi.spyOn(api, 'put').mockRejectedValue(new Error('not expected'))
  })
  afterEach(() => {
    getSpy.mockRestore()
    putSpy.mockRestore()
  })

  const editPopup = () =>
    screen.getByRole('heading', { name: 'Edit green bean lot' }).closest('form') as HTMLElement

  it('loads the parchment\'s Hull & Grade, shows the limit and refuses 4 kg -> 9 kg without sending', async () => {
    const onData = vi.fn()
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, parchmentLots: [parchment], greenBeanLots: [greenLot(6, 8), greenLot(7, 4)] }}
        refreshData={async () => {}}
        onData={onData}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit green bean lot GBL-2026-7' })[0])

    expect(await screen.findByTestId('edit-green-bean-hull-limit')).toHaveTextContent(
      'At most 8.00 kg: its Hull & Grade hulled 16.00 kg of parchment and the other green bean lots weigh 8.00 kg.',
    )
    expect(getSpy).toHaveBeenCalledWith('/parchment-lots', { processingBatchId: 'pb-5' })
    // Kept on the stored parchment lot, as its history popup does.
    expect(onData.mock.lastCall![0].parchmentLots[0].withdrawalHistory).toHaveLength(1)

    const popup = editPopup()
    fireEvent.change(within(popup).getByLabelText('Lot weight (kg)'), { target: { value: '9' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Save changes' }))

    expect(within(popup).getByText(
      /Green beans cannot weigh more than the parchment they were hulled from\. At most 8\.00 kg/,
    )).toBeInTheDocument()
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('loads nothing for a lot no Hull & Grade made', () => {
    const external = greenLot(9, 4, {
      sourceType: GreenBeanSourceType.External, parchmentLotId: undefined, parchmentWithdrawalId: undefined,
    })
    render(
      <Harness
        initial={{ ...INITIAL_APP_DATA, parchmentLots: [parchment], greenBeanLots: [external] }}
        refreshData={async () => {}}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit green bean lot GBL-2026-9' })[0])

    expect(screen.getByRole('heading', { name: 'Edit green bean lot' })).toBeInTheDocument()
    expect(screen.queryByTestId('edit-green-bean-hull-limit')).not.toBeInTheDocument()
    expect(getSpy).not.toHaveBeenCalledWith('/parchment-lots', expect.anything())
  })
})
