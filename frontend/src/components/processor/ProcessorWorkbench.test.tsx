import React, { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { GreenBeanSourceType, ProcessingBatchStatus, UserRole } from '../../types'
import type { AppData, Customer, GreenBeanLot, HarvestLot } from '../../types'
import { addProcessingBatch } from '../../services/processing/processingBatchService'
import { createWithdrawal, updateGreenBeanLotPrice } from '../../services/lots/greenBeanLotService'
import { addCustomer } from '../../services/sales/customerService'
import ProcessorWorkbench from './ProcessorWorkbench'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  addProcessingBatch: vi.fn(),
}))

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  updateGreenBeanLotPrice: vi.fn(),
  createWithdrawal: vi.fn(),
}))

vi.mock('../../services/sales/customerService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/sales/customerService')>(),
  addCustomer: vi.fn(),
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

function Harness({ initial, refreshData, onData }: {
  initial: AppData
  refreshData: () => Promise<void>
  onData?: (data: AppData) => void
}) {
  const [data, setData] = useState(initial)
  useEffect(() => { onData?.(data) }, [data, onData])
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

describe('Green bean price', () => {
  const greenLot: GreenBeanLot = {
    id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: GreenBeanSourceType.Internal,
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

    const stored = onData.mock.lastCall![0].greenBeanLots[0]
    expect(stored).toMatchObject({
      pricePerKg: 180, currency: 'THB', priceSetDate: '2026-09-23', priceSetBy: 'processor',
    })
    expect(stored.withdrawalHistory).toHaveLength(1)
  })

  it('offers the price action in the data grid too', () => {
    render(<Harness initial={{ ...INITIAL_APP_DATA, greenBeanLots: [greenLot] }} refreshData={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Price' }))
    expect(screen.getByRole('button', { name: 'Save price' })).toBeInTheDocument()
  })
})

describe('Sale customer picker', () => {
  const stockLot: GreenBeanLot = {
    id: 'gbl-1', displayId: 'GBL-2026-1', sourceType: GreenBeanSourceType.Internal,
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
    expect(onData.mock.lastCall![0].customers).toEqual([
      { id: 'c-9', name: 'Hill Roasters', type: 'Roaster', address: '9 Doi Rd' },
    ])

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
