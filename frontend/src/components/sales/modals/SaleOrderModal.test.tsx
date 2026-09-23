import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, User } from '../../../types'
import {
  createSaleOrder,
  getSellableRoasts,
  updateSaleOrder,
} from '../../../services/sales/saleOrderService'
import {
  TestDataProvider,
  appData,
  customer,
  roast,
  roasterUser,
  sale,
  saleItem,
  sellable,
} from '../../../test/salesFixtures'
import type { TestDataHandle } from '../../../test/salesFixtures'
import SaleOrderModal from './SaleOrderModal'
import type { SaleOrderModalProps } from './SaleOrderModal'

const { auth, addToast } = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  addToast: vi.fn(),
}))

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
// The real calendar popover is not what these tests are about.
vi.mock('../../common/DatePicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('../../../services/sales/saleOrderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/sales/saleOrderService')>()),
  getSellableRoasts: vi.fn(),
  createSaleOrder: vi.fn(),
  updateSaleOrder: vi.fn(),
}))

const today = () => new Date().toLocaleDateString('en-CA')

const group = (name: string) => screen.getByRole('group', { name })

/** Opens a common/Select inside the named group and clicks the option whose name matches. */
const choose = (groupName: string, option: RegExp | string) => {
  const g = group(groupName)
  fireEvent.click(within(g).getAllByRole('button')[0])
  fireEvent.click(within(g).getByRole('button', { name: option }))
}

const renderModal = (
  props: Partial<SaleOrderModalProps> = {},
  data: AppData = appData({ customers: [customer()] }),
) => {
  const handle: TestDataHandle = { current: data }
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const setIsEditing = vi.fn()
  const refreshData = vi.fn(async () => {})
  render(
    <MemoryRouter initialEntries={['/sales']}>
      <TestDataProvider initial={data} dataRef={handle} setIsEditing={setIsEditing} refreshData={refreshData}>
        <Routes>
          <Route
            path="/sales"
            element={<SaleOrderModal isOpen onClose={onClose} onSaved={onSaved} {...props} />}
          />
          <Route path="/customers" element={<p>Customers page</p>} />
        </Routes>
      </TestDataProvider>
    </MemoryRouter>,
  )
  return { handle, onClose, onSaved, setIsEditing, refreshData }
}

const rb1 = sellable({ id: 'rb-1', label: 'RB-0421', availableKg: 8 })
const rb2 = sellable({
  id: 'rb-2',
  label: 'RB-0107',
  greenBeanLotId: 'gbl-2',
  grade: 'Grade B',
  variety: 'Catimor',
  process: 'Natural',
  availableKg: 5,
})

describe('SaleOrderModal', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.currentUser = roasterUser
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [rb1, rb2], missingWeightCount: 0 })
  })

  it('lists roasts with the kg left to sell and pauses auto-refresh while open', async () => {
    const { setIsEditing } = renderModal({ initialCustomerId: 'cust-1' })

    expect(screen.getByRole('dialog', { name: 'Sell roasted coffee' })).toBeInTheDocument()
    expect(setIsEditing).toHaveBeenCalledWith(true)
    await screen.findByRole('group', { name: 'Roast for line 1' })
    fireEvent.click(within(group('Roast for line 1')).getAllByRole('button')[0])

    const option = within(group('Roast for line 1')).getByRole('button', { name: /RB-0421/ })
    expect(option).toHaveTextContent('RB-0421 · 10 Sep 2026 · Grade A Typica Washed · Medium — 8 kg left')
    expect(within(group('Roast for line 1')).getByRole('button', { name: /RB-0107/ })).toHaveTextContent(
      '— 5 kg left',
    )
    expect(getSellableRoasts).toHaveBeenCalledWith(undefined)
  })

  it('adds back the kg this sale already holds when editing', async () => {
    vi.mocked(getSellableRoasts).mockResolvedValue({
      roasts: [{ ...rb1, availableKg: 1.5 }],
      missingWeightCount: 0,
    })
    const order = sale({ items: [saleItem({ quantity: 2, roast: roast({ id: 'rb-1', availableKg: 1.5 }) })] })
    renderModal({ order })

    expect(screen.getByRole('dialog', { name: 'Edit sale ORD-2026-0001' })).toBeInTheDocument()
    await waitFor(() =>
      expect(within(group('Roast for line 1')).getByRole('button')).toHaveTextContent('3.5 kg left'),
    )
  })

  it("treats a roast missing from the sellable list as sold out, whatever the sale's own copy says", async () => {
    // RB-0421 had 10 kg. This sale took 4 (its copy still says 6 left), then
    // another sale took the other 6, so the roast is no longer sellable.
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [rb2], missingWeightCount: 0 })
    const order = sale({ items: [saleItem({ quantity: 4, roast: roast({ id: 'rb-1', availableKg: 6 }) })] })
    renderModal({ order }, appData({ customers: [customer()], saleOrders: [order] }))

    await waitFor(() =>
      expect(within(group('Roast for line 1')).getByRole('button')).toHaveTextContent('— 4 kg left'),
    )
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '9' } })
    expect(screen.getByText('Only 4 kg of RB-0421 left')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateSaleOrder).not.toHaveBeenCalled()
  })

  it('blocks a line that asks for more kg than is left', async () => {
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Roast for line 1' })
    choose('Roast for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })

    expect(screen.getByText('Only 8 kg of RB-0421 left')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
    expect(createSaleOrder).not.toHaveBeenCalled()
  })

  it('checks and sends kg and price the way the server records them', async () => {
    vi.mocked(createSaleOrder).mockResolvedValue({ saleOrder: sale(), affectedRoastBatches: [] })
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Roast for line 1' })
    choose('Roast for line 1', /RB-0421/)

    // Below the server's 0.001 kg minimum, and above its price ceiling.
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '0.0004' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '1000001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
    expect(screen.getByText('Kg must be at least 0.001')).toBeInTheDocument()
    expect(screen.getByText('Price per kg is too large')).toBeInTheDocument()
    expect(createSaleOrder).not.toHaveBeenCalled()

    // 8.0004 kg is 8 kg to the gram, which fits the 8 kg left.
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '8.0004' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100.006' } })
    expect(screen.queryByText(/Only 8 kg/)).not.toBeInTheDocument()
    expect(screen.getByTestId('sale-total')).toHaveTextContent('800.08 THB')
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

    await waitFor(() => expect(createSaleOrder).toHaveBeenCalled())
    expect(vi.mocked(createSaleOrder).mock.calls[0][0].items).toEqual([
      { roastBatchId: 'rb-1', quantity: 8, pricePerKg: 100.01 },
    ])
  })

  it('shows a live total and records the sale without status or amounts in the payload', async () => {
    const saved = sale({ id: 'sale-new', orderNumber: 'ORD-2026-0009' })
    vi.mocked(createSaleOrder).mockResolvedValue({
      saleOrder: saved,
      affectedRoastBatches: [{ id: 'rb-1', soldWeightKg: 4.5, availableKg: 5.5 }],
    })
    const { handle, onSaved, onClose } = renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Roast for line 1' })

    choose('Roast for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2.5' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '380' } })
    expect(screen.getByTestId('sale-total')).toHaveTextContent('950.00 THB')

    fireEvent.click(screen.getByRole('button', { name: 'Add roast' }))
    choose('Roast for line 2', /RB-0107/)
    fireEvent.change(screen.getAllByLabelText('Kg')[1], { target: { value: '0.1' } })
    fireEvent.change(screen.getAllByLabelText('Price / kg')[1], { target: { value: '1' } })
    expect(screen.getByTestId('sale-total')).toHaveTextContent('950.10 THB')

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '  Pick up Friday ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    const payload = vi.mocked(createSaleOrder).mock.calls[0][0]
    expect(payload).toEqual({
      customerId: 'cust-1',
      orderDate: today(),
      currency: 'THB',
      notes: 'Pick up Friday',
      items: [
        { roastBatchId: 'rb-1', quantity: 2.5, pricePerKg: 380 },
        { roastBatchId: 'rb-2', quantity: 0.1, pricePerKg: 1 },
      ],
    })
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('totalAmount')
    expect(handle.current.saleOrders.map((o) => o.id)).toEqual(['sale-new'])
    expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Sale ORD-2026-0009 recorded' })
    expect(onClose).toHaveBeenCalled()
  })

  it('sends expectedUpdatedAt and the lines when saving an edit', async () => {
    const order = sale({ items: [saleItem({ quantity: 2, pricePerKg: 500, roast: roast({ id: 'rb-1' }) })] })
    vi.mocked(updateSaleOrder).mockResolvedValue({ saleOrder: order, affectedRoastBatches: [] })
    renderModal({ order }, appData({ customers: [customer()], saleOrders: [order] }))
    await screen.findByRole('group', { name: 'Roast for line 1' })

    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateSaleOrder).toHaveBeenCalled())
    expect(updateSaleOrder).toHaveBeenCalledWith('sale-1', {
      customerId: 'cust-1',
      orderDate: '2026-09-20',
      currency: 'THB',
      notes: null,
      items: [{ roastBatchId: 'rb-1', quantity: 3, pricePerKg: 500 }],
      expectedUpdatedAt: '2026-09-20T03:00:00.000Z',
    })
    expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Sale ORD-2026-0001 updated' })
  })

  it('never sends lines for a sale recorded before roast sales', async () => {
    const order = sale({
      items: [saleItem({ id: 'legacy', roast: undefined, roastBatchId: undefined, lotGrade: 'Grade AA', quantity: 5 })],
    })
    vi.mocked(updateSaleOrder).mockResolvedValue({ saleOrder: order, affectedRoastBatches: [] })
    renderModal({ order })

    expect(screen.getByText("Lines recorded before roast sales can't be edited.")).toBeInTheDocument()
    expect(screen.getByText('Grade AA (green) · 5 kg')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Paid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateSaleOrder).toHaveBeenCalled())
    expect(vi.mocked(updateSaleOrder).mock.calls[0][1]).not.toHaveProperty('items')
  })

  it('disables a roast on the other lines once one line uses it', async () => {
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Roast for line 1' })
    choose('Roast for line 1', /RB-0421/)
    fireEvent.click(screen.getByRole('button', { name: 'Add roast' }))

    fireEvent.click(within(group('Roast for line 2')).getAllByRole('button')[0])
    expect(within(group('Roast for line 2')).getByRole('button', { name: /RB-0421/ })).toBeDisabled()
    expect(within(group('Roast for line 2')).getByRole('button', { name: /RB-0107/ })).toBeEnabled()
  })

  it('prefills the price from earlier sales in the same currency only', async () => {
    const thbSale = sale({
      id: 'thb',
      orderDate: '2026-09-21',
      currency: 'THB',
      items: [saleItem({ pricePerKg: 600, roast: roast({ id: 'rb-2', greenBeanLotId: 'gbl-2' }) })],
    })
    const usdSale = sale({
      id: 'usd',
      orderDate: '2026-09-01',
      currency: 'USD',
      items: [saleItem({ pricePerKg: 20, roast: roast({ id: 'rb-1' }) })],
    })
    renderModal(
      { initialCustomerId: 'cust-1' },
      appData({ customers: [customer()], saleOrders: [thbSale, usdSale] }),
    )
    await screen.findByRole('group', { name: 'Roast for line 1' })

    choose('Roast for line 1', /RB-0421/)
    expect(screen.getByLabelText('Price / kg')).toHaveValue('')

    choose('Currency', 'USD')
    expect(screen.getByLabelText('Price / kg')).toHaveValue('20')
  })

  it.each([
    ['', 'Choose a sale date'],
    ['2999-01-01', 'Sale date cannot be in the future'],
  ])('blocks the sale date %p', async (date, message) => {
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Roast for line 1' })
    choose('Roast for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })

    fireEvent.change(within(group('Sale date')).getByRole('textbox'), { target: { value: date } })
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(createSaleOrder).not.toHaveBeenCalled()
  })

  it('offers a way to the customer list when there are no customers', async () => {
    const { onClose } = renderModal({}, appData({ customers: [] }))

    expect(screen.getByText('No customers yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Customers' }))

    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText('Customers page')).toBeInTheDocument()
  })

  it('does not preselect a customer the picker cannot show', async () => {
    renderModal({ initialCustomerId: 'cust-unknown' })
    await screen.findByRole('group', { name: 'Roast for line 1' })
    choose('Roast for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })

    expect(within(group('Customer')).getByRole('button')).toHaveTextContent('Choose a customer')
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
    expect(within(group('Customer')).getByText('Choose a customer', { selector: 'p' })).toBeInTheDocument()
    expect(createSaleOrder).not.toHaveBeenCalled()
  })

  it('says how many older roasts cannot be sold for lack of a roasted weight', async () => {
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [rb1], missingWeightCount: 2 })
    renderModal({ initialCustomerId: 'cust-1' })

    expect(
      await screen.findByText(
        "2 older roasts have no roasted weight and can't be sold until it is added in the Roast Logbook.",
      ),
    ).toBeInTheDocument()
  })

  it('offers Retry when the roasts cannot be loaded', async () => {
    vi.mocked(getSellableRoasts)
      .mockRejectedValueOnce(new Error('Method Not Allowed'))
      .mockResolvedValueOnce({ roasts: [rb1], missingWeightCount: 0 })
    renderModal({ initialCustomerId: 'cust-1' })

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('group', { name: 'Roast for line 1' })).toBeInTheDocument()
    expect(getSellableRoasts).toHaveBeenCalledTimes(2)
  })

  it('shows the server message inline, and reloads and closes when the sale changed elsewhere', async () => {
    vi.mocked(createSaleOrder).mockRejectedValueOnce(
      new Error('Not enough roasted coffee left in RB-0421: at most 1.5 kg can go on this sale, 2 kg asked.'),
    )
    const { onClose, refreshData } = renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Roast for line 1' })
    choose('Roast for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('at most 1.5 kg can go on this sale')
    expect(onClose).not.toHaveBeenCalled()

    vi.mocked(createSaleOrder).mockRejectedValueOnce(
      new Error('This sale was changed or removed by someone else. Reload and try again.'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(refreshData).toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith({
      type: 'warning',
      message: 'This sale was changed or removed by someone else. Reload and try again.',
    })
  })
})
