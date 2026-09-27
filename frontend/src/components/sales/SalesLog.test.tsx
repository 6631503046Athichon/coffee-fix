import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, SaleOrder, User } from '../../types'
import type { SaleOrdersStatus } from '../../hooks/useDataContext'
import { csvFilename, downloadCsv } from '../../utils/exportCSV'
import {
  createSaleOrder,
  getSellableGreenLots,
  getSellableRoasts,
} from '../../services/sales/saleOrderService'
import {
  TestDataProvider,
  appData,
  customer,
  greenStock,
  roast,
  roasterUser,
  sale,
  saleItem,
  sellable,
} from '../../test/salesFixtures'
import SalesLog from './SalesLog'

const { auth, addToast } = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  addToast: vi.fn(),
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../common/DatePicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('../../utils/exportCSV', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/exportCSV')>()),
  downloadCsv: vi.fn(),
  csvFilename: vi.fn(() => 'sales_2026-09-23.csv'),
}))
vi.mock('../../services/sales/saleOrderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/sales/saleOrderService')>()),
  getSellableRoasts: vi.fn(),
  getSellableGreenLots: vi.fn(),
  createSaleOrder: vi.fn(),
}))

const aroma = customer({ id: 'cust-1', name: 'Cafe Aroma' })
const blueDoor = customer({ id: 'cust-2', name: 'Blue Door', type: 'Distributor' })
const quiet = customer({ id: 'cust-3', name: 'Quiet Corner' })

const s1 = sale({
  id: 's1',
  orderNumber: 'ORD-2026-0001',
  orderDate: '2026-09-01',
  createdAt: '2026-09-01T01:00:00.000Z',
  items: [
    saleItem({ id: 's1-a', quantity: 2, pricePerKg: 500, roast: roast({ id: 'rb-1', label: 'RB-0421' }) }),
    saleItem({ id: 's1-b', quantity: 1, pricePerKg: 400, lotGrade: 'Grade B', roast: roast({ id: 'rb-2', label: 'RB-0107', process: 'Natural' }) }),
  ],
})
const s2 = sale({
  id: 's2',
  orderNumber: 'ORD-2026-0002',
  customerId: 'cust-2',
  customerName: 'Blue Door',
  customer: { id: 'cust-2', name: 'Blue Door', type: 'Distributor' },
  orderDate: '2026-09-10',
  createdAt: '2026-09-10T01:00:00.000Z',
  status: 'Delivered',
  currency: 'USD',
  items: [saleItem({ id: 's2-a', quantity: 3, pricePerKg: 20, roast: roast({ id: 'rb-3', label: 'RB-0555', variety: 'Geisha' }) })],
})
const s3 = sale({
  id: 's3',
  orderNumber: 'ORD-2026-0003',
  orderDate: '2026-09-15',
  createdAt: '2026-09-15T01:00:00.000Z',
  status: 'Cancelled',
  notes: 'Wrong address',
  items: [saleItem({ id: 's3-a', quantity: 4, pricePerKg: 250 })],
})

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

const renderLog = ({
  data = appData({ customers: [aroma, blueDoor, quiet], saleOrders: [s3, s2, s1] }),
  url = '/sales',
  status = 'ok',
  refreshData = vi.fn(async () => {}),
}: { data?: AppData; url?: string; status?: SaleOrdersStatus; refreshData?: () => Promise<void> } = {}) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <TestDataProvider initial={data} saleOrdersStatus={status} refreshData={refreshData}>
        <Routes>
          <Route path="/sales" element={<SalesLog currentUser={roasterUser} />} />
        </Routes>
        <LocationProbe />
      </TestDataProvider>
    </MemoryRouter>,
  )
  return { refreshData }
}

const table = () => screen.getByRole('table', { name: 'Sales' })
const shownSales = () =>
  within(table())
    .queryAllByRole('row')
    .slice(1)
    .map((row) => row.getAttribute('aria-label'))
const group = (name: string) => screen.getByRole('group', { name })

// Rendering the whole log is slow in jsdom when the suite runs in parallel.
describe('SalesLog', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.currentUser = roasterUser
    vi.mocked(getSellableGreenLots).mockResolvedValue([])
  })

  it('lists sales newest first and narrows them by date', () => {
    renderLog()
    expect(shownSales()).toEqual(['Sale ORD-2026-0003', 'Sale ORD-2026-0002', 'Sale ORD-2026-0001'])

    fireEvent.change(within(group('From')).getByRole('textbox'), { target: { value: '2026-09-05' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0003', 'Sale ORD-2026-0002'])
    fireEvent.change(within(group('To')).getByRole('textbox'), { target: { value: '2026-09-12' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(shownSales()).toHaveLength(3)
  })

  it('narrows by customer and keeps the choice in the address', () => {
    renderLog()
    fireEvent.click(within(group('Customer')).getAllByRole('button')[0])
    fireEvent.click(within(group('Customer')).getByRole('button', { name: 'Blue Door' }))
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
    expect(screen.getByTestId('location')).toHaveTextContent('/sales?customer=cust-2')
  })

  it('narrows by status', () => {
    renderLog()
    fireEvent.click(within(group('Status')).getByRole('button', { name: 'Cancelled' }))
    expect(shownSales()).toEqual(['Sale ORD-2026-0003'])
    fireEvent.click(within(group('Status')).getByRole('button', { name: 'Delivered' }))
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
  })

  it('searches sale numbers, customers, notes and roast details', () => {
    renderLog()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'natural' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0001'])
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'geisha' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'wrong address' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0003'])
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'blue door' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
  })

  it('swaps From and To when From ends up after To', () => {
    renderLog()
    fireEvent.change(within(group('To')).getByRole('textbox'), { target: { value: '2026-09-05' } })
    fireEvent.change(within(group('From')).getByRole('textbox'), { target: { value: '2026-09-12' } })

    expect(within(group('From')).getByRole('textbox')).toHaveValue('2026-09-05')
    expect(within(group('To')).getByRole('textbox')).toHaveValue('2026-09-12')
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
  })

  it('preselects the customer from ?customer= and offers to sell to one with no sales', () => {
    renderLog({ url: '/sales?customer=cust-2' })
    expect(shownSales()).toEqual(['Sale ORD-2026-0002'])
    expect(within(group('Customer')).getByRole('button')).toHaveTextContent('Blue Door')
  })

  it('shows an empty state with a Sell button for a customer who has no sales', () => {
    renderLog({ url: '/sales?customer=cust-3' })
    expect(screen.getByText('No sales for Quiet Corner yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sell to Quiet Corner' })).toBeInTheDocument()
  })

  it('opens the sale from ?sale= and removes it from the address', async () => {
    renderLog({ url: '/sales?customer=cust-1&sale=s1' })

    expect(screen.getByRole('dialog', { name: 'Sale ORD-2026-0001' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/sales\?customer=cust-1$/))
  })

  it('drops an unknown ?sale= once sales have loaded', async () => {
    renderLog({ url: '/sales?sale=missing' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/sales$/))
  })

  it('leaves cancelled sales out of the totals', () => {
    renderLog()
    expect(screen.getByTestId('totals-count')).toHaveTextContent('2')
    expect(screen.getByTestId('totals-kg')).toHaveTextContent('6')
    expect(screen.getByTestId('totals-money')).toHaveTextContent('60.00 USD · 1,400.00 THB')
    expect(screen.getByText('Cancelled sales are not counted')).toBeInTheDocument()
  })

  it('exports every filtered sale on every page, one row per line', () => {
    const many: SaleOrder[] = Array.from({ length: 25 }, (_, i) =>
      sale({
        id: `m${i}`,
        orderNumber: `ORD-2026-${String(100 + i).padStart(4, '0')}`,
        orderDate: `2026-08-${String(i + 1).padStart(2, '0')}`,
        createdAt: `2026-08-${String(i + 1).padStart(2, '0')}T01:00:00.000Z`,
        items: [
          saleItem({ id: `m${i}-a`, quantity: 1.5, pricePerKg: 300, roast: roast({ id: `rb-${i}`, label: `RB-${1000 + i}` }) }),
          saleItem({ id: `m${i}-b`, quantity: 0.25, pricePerKg: 410.5, roast: roast({ id: `rb-x${i}`, label: `RB-${2000 + i}` }) }),
        ],
      }),
    )
    const other = sale({ id: 'other', orderNumber: 'ORD-2026-0999', customerId: 'cust-2', customerName: 'Blue Door', orderDate: '2026-08-15' })
    renderLog({ data: appData({ customers: [aroma, blueDoor], saleOrders: [...many, other] }), url: '/sales?customer=cust-1' })
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ORD-2026' } })

    expect(shownSales()).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(csvFilename).toHaveBeenCalledWith('sales', ['', '', 'Cafe Aroma', false, 'search-ORD-2026'])
    const [filename, headers, rows] = vi.mocked(downloadCsv).mock.calls[0]
    expect(filename).toBe('sales_2026-09-23.csv')
    expect(headers).toEqual([
      'Sale #', 'Date', 'Status', 'Customer', 'Customer type', 'Item', 'Roast ID', 'Roast date', 'Roast level',
      'Green lot', 'Grade', 'Variety', 'Process', 'Kg', 'Price per kg', 'Line total', 'Sale total',
      'Currency', 'Notes',
    ])
    expect(rows).toHaveLength(50)
    expect(rows.some((row) => row[0] === 'ORD-2026-0999')).toBe(false)
    // Newest first, as shown; the sale total only on each sale's first line.
    expect(rows[0]).toEqual([
      'ORD-2026-0124', '2026-08-25', 'Confirmed', 'Cafe Aroma', 'Retailer', 'Roasted', 'RB-1024', '2026-09-10',
      'Medium', 'GBL-2026-7', 'Grade A', 'Typica', 'Washed', '1.500', '300.00', '450.00', '552.63',
      'THB', '',
    ])
    expect(rows[1].slice(0, 1)).toEqual(['ORD-2026-0124'])
    expect(rows[1][6]).toBe('RB-2024')
    expect(rows[1][13]).toBe('0.250')
    expect(rows[1][16]).toBe('')
    expect(rows[49][0]).toBe('ORD-2026-0100')
  })

  it('exports a green-bean line with its lot and blank roast columns', () => {
    const greenSale = sale({
      id: 'g1',
      orderNumber: 'ORD-2026-0050',
      items: [
        saleItem({
          id: 'g1-a',
          quantity: 5,
          pricePerKg: 320,
          lotGrade: 'Grade AA',
          green: greenStock({ label: 'ROA-4412', greenBeanLotDisplayId: 'GBL-2026-9', variety: 'Geisha', process: 'Natural' }),
        }),
        saleItem({ id: 'g1-b', roast: undefined, roastBatchId: undefined, quantity: 1, pricePerKg: 100 }),
      ],
    })
    renderLog({ data: appData({ customers: [aroma], saleOrders: [greenSale] }) })
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    const rows = vi.mocked(downloadCsv).mock.calls[0][2]
    expect(rows[0].slice(5, 13)).toEqual([
      'Green beans', '', '', '', 'GBL-2026-9', 'Grade AA', 'Geisha', 'Natural',
    ])
    expect(rows[1][5]).toBe('Green beans (older sale)')
  })

  it('finds green-bean sales by searching green', () => {
    const greenSale = sale({
      id: 'g1',
      orderNumber: 'ORD-2026-0050',
      orderDate: '2026-09-20',
      createdAt: '2026-09-20T01:00:00.000Z',
      items: [saleItem({ id: 'g1-a', green: greenStock({ label: 'ROA-4412' }) })],
    })
    renderLog({ data: appData({ customers: [aroma, blueDoor], saleOrders: [greenSale, s2, s1] }) })

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'green' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0050'])
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'roa-4412' } })
    expect(shownSales()).toEqual(['Sale ORD-2026-0050'])
  })

  it('splits Kg sold into roasted and green once a green line counts', () => {
    const greenSale = sale({
      id: 'g1',
      orderNumber: 'ORD-2026-0050',
      orderDate: '2026-09-20',
      createdAt: '2026-09-20T01:00:00.000Z',
      items: [saleItem({ id: 'g1-a', quantity: 5, green: greenStock() })],
    })
    renderLog({ data: appData({ customers: [aroma, blueDoor], saleOrders: [greenSale, s3, s2, s1] }) })

    expect(screen.getByTestId('totals-kg')).toHaveTextContent('6 roasted · 5 green')
  })

  it('disables Export when nothing matches', () => {
    renderLog()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'nothing like this' } })
    expect(screen.getByText('No sales match these filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('opens details on a row click and on Enter', () => {
    renderLog()
    fireEvent.click(within(table()).getByRole('row', { name: 'Sale ORD-2026-0002' }))
    expect(screen.getByRole('dialog', { name: 'Sale ORD-2026-0002' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.keyDown(within(table()).getByRole('row', { name: 'Sale ORD-2026-0001' }), { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Sale ORD-2026-0001' })).toBeInTheDocument()
  })

  it('opens the edit popup from a row without opening details', async () => {
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [], missingWeightCount: 0 })
    renderLog()
    const row = within(table()).getByRole('row', { name: 'Sale ORD-2026-0001' })
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('dialog', { name: 'Edit sale ORD-2026-0001' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await waitFor(() => expect(getSellableRoasts).toHaveBeenCalled())
  })

  it('opens details on the delete confirmation from a row', () => {
    renderLog()
    const row = within(table()).getByRole('row', { name: 'Sale ORD-2026-0002' })
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('alertdialog', { name: 'Delete sale ORD-2026-0002?' })).toBeInTheDocument()
  })

  it('shows the details of a sale right after it is recorded', async () => {
    const recorded = sale({ id: 'new', orderNumber: 'ORD-2026-0042', orderDate: '2026-09-22', createdAt: '2026-09-22T05:00:00.000Z' })
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [sellable({ id: 'rb-1' })], missingWeightCount: 0 })
    vi.mocked(createSaleOrder).mockResolvedValue({
      saleOrder: recorded,
      affectedRoastBatches: [],
      affectedInventoryItems: [],
    })
    renderLog({ url: '/sales?customer=cust-1' })

    fireEvent.click(screen.getByRole('button', { name: 'New sale' }))
    const roastGroup = await screen.findByRole('group', { name: 'Item for line 1' })
    fireEvent.click(within(roastGroup).getAllByRole('button')[0])
    fireEvent.click(within(roastGroup).getByRole('button', { name: /RB-0421/ }))
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

    expect(await screen.findByRole('dialog', { name: 'Sale ORD-2026-0042' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(vi.mocked(createSaleOrder).mock.calls[0][0].customerId).toBe('cust-1')
    expect(shownSales()[0]).toBe('Sale ORD-2026-0042')
  })

  it('offers Retry when sales failed to load and none are shown', () => {
    const { refreshData } = renderLog({ data: appData({ customers: [aroma] }), status: 'failed' })
    expect(screen.getByText("Couldn't load sales")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refreshData).toHaveBeenCalled()
  })

  it('says there are no sales yet', () => {
    renderLog({ data: appData({ customers: [aroma] }) })
    expect(screen.getByText('No sales yet')).toBeInTheDocument()
  })

  it("offers to sell to the customer a roaster with no sales yet came to see", async () => {
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [sellable({ id: 'rb-1' })], missingWeightCount: 0 })
    renderLog({ data: appData({ customers: [aroma, quiet] }), url: '/sales?customer=cust-3' })

    expect(screen.getByText('No sales for Quiet Corner yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sell to Quiet Corner' }))

    const dialog = screen.getByRole('dialog', { name: 'Sell coffee' })
    expect(within(within(dialog).getByRole('group', { name: 'Customer' })).getByRole('button')).toHaveTextContent(
      'Quiet Corner (Retailer)',
    )
    await within(dialog).findByRole('group', { name: 'Item for line 1' })
  })

  it('starts a new sale with the chosen customer from the no-sales-yet state too', async () => {
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [sellable({ id: 'rb-1' })], missingWeightCount: 0 })
    // A customer plus a status filter is not the one-customer shortcut.
    renderLog({ data: appData({ customers: [aroma, quiet] }), url: '/sales?customer=cust-3' })
    fireEvent.click(within(group('Status')).getByRole('button', { name: 'Delivered' }))

    expect(screen.getByText('No sales yet')).toBeInTheDocument()
    const emptyState = screen.getByText('No sales yet').parentElement as HTMLElement
    fireEvent.click(within(emptyState).getByRole('button', { name: 'New sale' }))

    const dialog = screen.getByRole('dialog', { name: 'Sell coffee' })
    expect(within(within(dialog).getByRole('group', { name: 'Customer' })).getByRole('button')).toHaveTextContent(
      'Quiet Corner (Retailer)',
    )
    await within(dialog).findByRole('group', { name: 'Item for line 1' })
  })
})
