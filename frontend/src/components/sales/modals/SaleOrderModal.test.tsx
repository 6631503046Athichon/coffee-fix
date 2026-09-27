import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Customer, RoasterInventoryItem, User } from '../../../types'
import {
  createSaleOrder,
  getSellableGreenLots,
  getSellableRoasts,
  updateSaleOrder,
} from '../../../services/sales/saleOrderService'
import { addCustomer } from '../../../services/sales/customerService'
import { getAllUsersOrThrow } from '../../../services/auth/userService'
import { toRoaId } from '../../../utils/formatters'
import { UserRole } from '../../../types'
import {
  TestDataProvider,
  adminUser,
  appData,
  customer,
  greenStock,
  roast,
  roasterUser,
  sale,
  saleItem,
  sellable,
  sellableGreen,
} from '../../../test/salesFixtures'
import type { TestDataHandle } from '../../../test/salesFixtures'
import SaleOrderModal, { SaleOrderForm } from './SaleOrderModal'
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
  getSellableGreenLots: vi.fn(),
  createSaleOrder: vi.fn(),
  updateSaleOrder: vi.fn(),
}))
vi.mock('../../../services/sales/customerService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/sales/customerService')>()),
  addCustomer: vi.fn(),
}))
vi.mock('../../../services/auth/userService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/auth/userService')>()),
  getAllUsersOrThrow: vi.fn(),
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
    vi.mocked(getSellableGreenLots).mockResolvedValue([])
  })

  it('lists roasts with the kg left to sell and pauses auto-refresh while open', async () => {
    const { setIsEditing } = renderModal({ initialCustomerId: 'cust-1' })

    expect(screen.getByRole('dialog', { name: 'Sell coffee' })).toBeInTheDocument()
    expect(setIsEditing).toHaveBeenCalledWith(true)
    await screen.findByRole('group', { name: 'Item for line 1' })
    fireEvent.click(within(group('Item for line 1')).getAllByRole('button')[0])

    const option = within(group('Item for line 1')).getByRole('button', { name: /RB-0421/ })
    expect(option).toHaveTextContent('RB-0421 · 10 Sep 2026 · Grade A Typica Washed · Medium — 8 kg left')
    expect(within(group('Item for line 1')).getByRole('button', { name: /RB-0107/ })).toHaveTextContent(
      '— 5 kg left',
    )
    expect(getSellableRoasts).toHaveBeenCalledWith(undefined)
    expect(getSellableGreenLots).toHaveBeenCalledWith(undefined)
    // A roaster sells only their own stock: no seller to pick.
    expect(screen.queryByRole('group', { name: 'Sell for' })).not.toBeInTheDocument()
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
      expect(within(group('Item for line 1')).getByRole('button')).toHaveTextContent('3.5 kg left'),
    )
  })

  it("treats a roast missing from the sellable list as sold out, whatever the sale's own copy says", async () => {
    // RB-0421 had 10 kg. This sale took 4 (its copy still says 6 left), then
    // another sale took the other 6, so the roast is no longer sellable.
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [rb2], missingWeightCount: 0 })
    const order = sale({ items: [saleItem({ quantity: 4, roast: roast({ id: 'rb-1', availableKg: 6 }) })] })
    renderModal({ order }, appData({ customers: [customer()], saleOrders: [order] }))

    await waitFor(() =>
      expect(within(group('Item for line 1')).getByRole('button')).toHaveTextContent('— 4 kg left'),
    )
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '9' } })
    expect(screen.getByText('Only 4 kg of RB-0421 left')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateSaleOrder).not.toHaveBeenCalled()
  })

  it('blocks a line that asks for more kg than is left', async () => {
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Item for line 1' })
    choose('Item for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })

    expect(screen.getByText('Only 8 kg of RB-0421 left')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
    expect(createSaleOrder).not.toHaveBeenCalled()
  })

  it('checks and sends kg and price the way the server records them', async () => {
    vi.mocked(createSaleOrder).mockResolvedValue({
      saleOrder: sale(),
      affectedRoastBatches: [],
      affectedInventoryItems: [],
    })
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Item for line 1' })
    choose('Item for line 1', /RB-0421/)

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
      affectedInventoryItems: [],
    })
    const { handle, onSaved, onClose } = renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Item for line 1' })

    choose('Item for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2.5' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '380' } })
    expect(screen.getByTestId('sale-total')).toHaveTextContent('950.00 THB')

    fireEvent.click(screen.getByRole('button', { name: 'Add line' }))
    choose('Item for line 2', /RB-0107/)
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
    // The fixture copies app data into the handle from an effect, so wait for it.
    await waitFor(() => expect(handle.current.saleOrders.map((o) => o.id)).toEqual(['sale-new']))
    expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Sale ORD-2026-0009 recorded' })
    expect(onClose).toHaveBeenCalled()
  })

  it('sends expectedUpdatedAt and the lines when saving an edit', async () => {
    const order = sale({ items: [saleItem({ quantity: 2, pricePerKg: 500, roast: roast({ id: 'rb-1' }) })] })
    vi.mocked(updateSaleOrder).mockResolvedValue({
      saleOrder: order,
      affectedRoastBatches: [],
      affectedInventoryItems: [],
    })
    renderModal({ order }, appData({ customers: [customer()], saleOrders: [order] }))
    await screen.findByRole('group', { name: 'Item for line 1' })

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
    vi.mocked(updateSaleOrder).mockResolvedValue({
      saleOrder: order,
      affectedRoastBatches: [],
      affectedInventoryItems: [],
    })
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
    await screen.findByRole('group', { name: 'Item for line 1' })
    choose('Item for line 1', /RB-0421/)
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }))

    fireEvent.click(within(group('Item for line 2')).getAllByRole('button')[0])
    expect(within(group('Item for line 2')).getByRole('button', { name: /RB-0421/ })).toBeDisabled()
    expect(within(group('Item for line 2')).getByRole('button', { name: /RB-0107/ })).toBeEnabled()
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
    await screen.findByRole('group', { name: 'Item for line 1' })

    choose('Item for line 1', /RB-0421/)
    expect(screen.getByLabelText('Price / kg')).toHaveValue('')

    choose('Currency', 'USD')
    expect(screen.getByLabelText('Price / kg')).toHaveValue('20')
  })

  it.each([
    ['', 'Choose a sale date'],
    ['2999-01-01', 'Sale date cannot be in the future'],
  ])('blocks the sale date %p', async (date, message) => {
    renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Item for line 1' })
    choose('Item for line 1', /RB-0421/)
    fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })

    fireEvent.change(within(group('Sale date')).getByRole('textbox'), { target: { value: date } })
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(createSaleOrder).not.toHaveBeenCalled()
  })

  it('offers a filled New customer button when there are no customers yet', async () => {
    renderModal({}, appData({ customers: [] }))

    const picker = within(group('Customer')).getByRole('button')
    expect(picker).toHaveTextContent('No customers yet')
    expect(picker).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New customer' })).toHaveClass('bg-blue-600', 'text-white')
    expect(screen.queryByRole('button', { name: 'Go to Customers' })).not.toBeInTheDocument()
    await screen.findByRole('group', { name: 'Item for line 1' })
  })

  it('does not preselect a customer the picker cannot show', async () => {
    renderModal({ initialCustomerId: 'cust-unknown' })
    await screen.findByRole('group', { name: 'Item for line 1' })
    choose('Item for line 1', /RB-0421/)
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

    expect(await screen.findByText("Couldn't load your roasted coffee.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('group', { name: 'Item for line 1' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText("Couldn't load your roasted coffee.")).not.toBeInTheDocument())
    expect(getSellableRoasts).toHaveBeenCalledTimes(2)
    expect(getSellableGreenLots).toHaveBeenCalledTimes(2)
  })

  it('shows one block with Retry when neither list loads', async () => {
    vi.mocked(getSellableRoasts).mockRejectedValue(new Error('Server down'))
    vi.mocked(getSellableGreenLots).mockRejectedValue(new Error('Server down'))
    renderModal({ initialCustomerId: 'cust-1' })

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your stock. Server down")
    expect(screen.queryByRole('group', { name: 'Item for line 1' })).not.toBeInTheDocument()
  })

  it('shows the server message inline, and reloads and closes when the sale changed elsewhere', async () => {
    vi.mocked(createSaleOrder).mockRejectedValueOnce(
      new Error('Not enough roasted coffee left in RB-0421: at most 1.5 kg can go on this sale, 2 kg asked.'),
    )
    const { onClose, refreshData } = renderModal({ initialCustomerId: 'cust-1' })
    await screen.findByRole('group', { name: 'Item for line 1' })
    choose('Item for line 1', /RB-0421/)
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

  describe('green beans', () => {
    const inv1 = sellableGreen({ id: 'inv-1', label: 'ROA-4412', greenBeanLotId: 'gbl-9', availableKg: 12 })
    const stockRow = (over: Partial<RoasterInventoryItem> = {}): RoasterInventoryItem => ({
      id: 'inv-1',
      roasterId: roasterUser.id,
      greenBeanLotId: 'gbl-9',
      claimedWeightKg: 20,
      remainingWeightKg: 12,
      greenBeanDisplayId: 'GBL-2026-9',
      grade: 'Grade A',
      variety: 'Typica',
      process: 'Washed',
      ...over,
    })

    beforeEach(() => {
      vi.mocked(getSellableGreenLots).mockResolvedValue([inv1])
    })

    it('lists green beans from stock next to roasted coffee', async () => {
      renderModal({ initialCustomerId: 'cust-1' })
      await screen.findByRole('group', { name: 'Item for line 1' })
      fireEvent.click(within(group('Item for line 1')).getAllByRole('button')[0])

      const options = within(group('Item for line 1'))
      expect(options.getByRole('button', { name: /ROA-4412/ })).toHaveTextContent(
        'Green beans · ROA-4412 · GBL-2026-9 · Grade A Typica Washed — 12 kg left',
      )
      expect(options.getByRole('button', { name: /RB-0421/ }).textContent).toMatch(/^Roasted · RB-0421/)
      expect(within(group('Item for line 1')).getAllByRole('button')[0]).toHaveTextContent(
        'Choose roasted coffee or green beans',
      )
    })

    it('records a sale that mixes roasted coffee and green beans', async () => {
      vi.mocked(createSaleOrder).mockResolvedValue({
        saleOrder: sale({ id: 'sale-new' }),
        affectedRoastBatches: [],
        affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 7 }],
      })
      const { handle } = renderModal(
        { initialCustomerId: 'cust-1' },
        appData({ customers: [customer()], roasterInventory: [stockRow()] }),
      )
      await screen.findByRole('group', { name: 'Item for line 1' })

      choose('Item for line 1', /RB-0421/)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2.5' } })
      fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '900' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add line' }))
      choose('Item for line 2', /ROA-4412/)
      fireEvent.change(screen.getAllByLabelText('Kg')[1], { target: { value: '5' } })
      fireEvent.change(screen.getAllByLabelText('Price / kg')[1], { target: { value: '320' } })
      expect(screen.getByTestId('sale-total')).toHaveTextContent('3,850.00 THB')
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

      await waitFor(() => expect(createSaleOrder).toHaveBeenCalled())
      const payload = vi.mocked(createSaleOrder).mock.calls[0][0]
      expect(payload.items).toEqual([
        { roastBatchId: 'rb-1', quantity: 2.5, pricePerKg: 900 },
        { roasterInventoryId: 'inv-1', quantity: 5, pricePerKg: 320 },
      ])
      expect(payload).not.toHaveProperty('status')
      expect(payload).not.toHaveProperty('totalAmount')
      await waitFor(() => expect(handle.current.roasterInventory[0].remainingWeightKg).toBe(7))
    })

    it('blocks a green line that asks for more kg than the stock row has', async () => {
      renderModal({ initialCustomerId: 'cust-1' })
      await screen.findByRole('group', { name: 'Item for line 1' })
      choose('Item for line 1', /ROA-4412/)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '13' } })
      fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '300' } })

      expect(screen.getByText('Only 12 kg of ROA-4412 left')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
      expect(createSaleOrder).not.toHaveBeenCalled()
    })

    it('does not offer the same stock row on two lines', async () => {
      renderModal({ initialCustomerId: 'cust-1' })
      await screen.findByRole('group', { name: 'Item for line 1' })
      choose('Item for line 1', /ROA-4412/)
      fireEvent.click(screen.getByRole('button', { name: 'Add line' }))

      fireEvent.click(within(group('Item for line 2')).getAllByRole('button')[0])
      expect(within(group('Item for line 2')).getByRole('button', { name: /ROA-4412/ })).toBeDisabled()
    })

    it('edits a sale with green lines and adds back the kg it holds on the stock row', async () => {
      vi.mocked(getSellableGreenLots).mockResolvedValue([{ ...inv1, availableKg: 1.5 }])
      const order = sale({
        items: [saleItem({ quantity: 2, pricePerKg: 320, green: greenStock({ id: 'inv-1', availableKg: 1.5 }) })],
      })
      vi.mocked(updateSaleOrder).mockResolvedValue({
        saleOrder: order,
        affectedRoastBatches: [],
        affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 0.5 }],
      })
      renderModal({ order })

      await waitFor(() =>
        expect(within(group('Item for line 1')).getByRole('button')).toHaveTextContent('3.5 kg left'),
      )
      expect(screen.queryByText("Lines recorded before roast sales can't be edited.")).not.toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(updateSaleOrder).toHaveBeenCalled())
      expect(vi.mocked(updateSaleOrder).mock.calls[0][1].items).toEqual([
        { roasterInventoryId: 'inv-1', quantity: 3, pricePerKg: 320 },
      ])
    })

    it('starts on the stock row handed over, with its kg and an earlier green price', async () => {
      // Newest sale: a roast of the same green lot at 900 (never used for green
      // beans). Older sale: green beans of that lot at 320.
      const roasted = sale({
        id: 'roasted',
        orderDate: '2026-09-21',
        items: [saleItem({ pricePerKg: 900, roast: roast({ id: 'rb-9', greenBeanLotId: 'gbl-9' }) })],
      })
      const green = sale({
        id: 'green',
        orderDate: '2026-09-01',
        items: [saleItem({ pricePerKg: 320, green: greenStock({ id: 'inv-old', greenBeanLotId: 'gbl-9' }) })],
      })
      renderModal(
        { initialCustomerId: 'cust-1', initialGreenLine: { roasterInventoryId: 'inv-1', kg: 3 } },
        appData({ customers: [customer()], saleOrders: [roasted, green], roasterInventory: [stockRow()] }),
      )

      await waitFor(() =>
        expect(within(group('Item for line 1')).getByRole('button')).toHaveTextContent(
          'Green beans · ROA-4412 · GBL-2026-9 · Grade A Typica Washed — 12 kg left',
        ),
      )
      expect(screen.getByLabelText('Kg')).toHaveValue('3')
      expect(screen.getByLabelText('Price / kg')).toHaveValue('320')
    })

    it('drops the handed-over stock row when the loaded list does not have it', async () => {
      vi.mocked(getSellableGreenLots).mockResolvedValue([])
      const lotId = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
      renderModal(
        { initialCustomerId: 'cust-1', initialGreenLine: { roasterInventoryId: 'inv-1', kg: 3 } },
        appData({ customers: [customer()], roasterInventory: [stockRow({ greenBeanLotId: lotId })] }),
      )

      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(within(group('Item for line 1')).getByRole('button')).toHaveTextContent(
        'Choose roasted coffee or green beans',
      )
      // Says why the line is empty, until something else is chosen.
      const gone = `${toRoaId(lotId)} has no green beans left to sell. Choose another item.`
      expect(screen.getByText(gone)).toBeInTheDocument()
      choose('Item for line 1', /^Roasted · RB-0421/)
      expect(screen.queryByText(gone)).not.toBeInTheDocument()
    })

    it('prefills the handed-over kg rounded down to the gram the stock row has free', async () => {
      vi.mocked(getSellableGreenLots).mockResolvedValue([{ ...inv1, availableKg: 12.345 }])
      renderModal(
        { initialCustomerId: 'cust-1', initialGreenLine: { roasterInventoryId: 'inv-1', kg: 12.3456 } },
        appData({ customers: [customer()], roasterInventory: [stockRow({ remainingWeightKg: 12.3456 })] }),
      )

      await waitFor(() =>
        expect(within(group('Item for line 1')).getByRole('button')).toHaveTextContent('12.345 kg left'),
      )
      expect(screen.getByLabelText('Kg')).toHaveValue('12.345')
      expect(screen.queryByText(/^Only .* left$/)).not.toBeInTheDocument()
    })

    it('keeps the handed-over stock row when the green list fails, and waits for Retry', async () => {
      vi.mocked(getSellableGreenLots).mockRejectedValue(new Error('Not Found'))
      const lotId = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
      renderModal(
        { initialCustomerId: 'cust-1', initialGreenLine: { roasterInventoryId: 'inv-1', kg: 3 } },
        appData({ customers: [customer()], roasterInventory: [stockRow({ greenBeanLotId: lotId })] }),
      )

      expect(await screen.findByText("Couldn't load your green beans.")).toBeInTheDocument()
      // Named from the app data: the ROA id the roaster pages show for the lot.
      const picker = within(group('Item for line 1')).getByRole('button')
      expect(picker).toHaveTextContent(
        `Green beans · ${toRoaId(lotId)} · GBL-2026-9 · Grade A Typica Washed`,
      )
      expect(picker).not.toHaveTextContent('kg left')
      expect(screen.getByText('Press Retry to load your green beans')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '300' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))
      expect(createSaleOrder).not.toHaveBeenCalled()
    })

    it('still sells roasted coffee when only the green list fails', async () => {
      vi.mocked(getSellableGreenLots).mockRejectedValue(new Error('Not Found'))
      vi.mocked(createSaleOrder).mockResolvedValue({
        saleOrder: sale(),
        affectedRoastBatches: [],
        affectedInventoryItems: [],
      })
      renderModal({ initialCustomerId: 'cust-1' })

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent("Couldn't load your green beans.")
      expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      choose('Item for line 1', /RB-0421/)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1' } })
      fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

      await waitFor(() => expect(createSaleOrder).toHaveBeenCalled())
      expect(vi.mocked(createSaleOrder).mock.calls[0][0].items).toEqual([
        { roastBatchId: 'rb-1', quantity: 1, pricePerKg: 100 },
      ])
    })
  })

  describe('an Admin selling for a roaster', () => {
    const anchor: User = { id: 'user-roaster-2', name: 'Anchor Roasters', roles: [UserRole.Roaster] }
    const farmer: User = { id: 'user-farmer', name: 'Ban Farm', roles: [UserRole.Farmer] }
    const rb9 = sellable({ id: 'rb-9', label: 'RB-0900', roasterId: anchor.id, availableKg: 4 })
    const adminData = (over: Partial<AppData> = {}) =>
      appData({ customers: [customer()], users: [adminUser, roasterUser, anchor, farmer], ...over })

    beforeEach(() => {
      auth.currentUser = adminUser
      vi.mocked(getSellableRoasts).mockImplementation(async (roasterId) =>
        roasterId === anchor.id
          ? { roasts: [rb9], missingWeightCount: 0 }
          : { roasts: [rb1, rb2], missingWeightCount: 0 },
      )
    })

    it('asks which roaster the sale is for before listing any stock', async () => {
      renderModal({ initialCustomerId: 'cust-1' }, adminData())

      const picker = within(group('Sell for')).getByRole('button')
      expect(picker).toHaveTextContent('Choose a roaster')
      expect(
        screen.getByText('Choose who you are selling for to see their roasted coffee and green beans.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Item for line 1' })).not.toBeInTheDocument()
      expect(getSellableRoasts).not.toHaveBeenCalled()
      expect(getSellableGreenLots).not.toHaveBeenCalled()

      // The Admin first, then only users with the Roaster role, sorted by name.
      fireEvent.click(picker)
      const names = within(group('Sell for'))
        .getAllByRole('button')
        .slice(1)
        .map((b) => b.textContent)
      expect(names).toEqual(['Me (Admin)', 'Anchor Roasters', 'Bean Roasters'])

      fireEvent.click(within(group('Sell for')).getByRole('button', { name: 'Bean Roasters' }))
      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(getSellableRoasts).toHaveBeenCalledWith(roasterUser.id)
      expect(getSellableGreenLots).toHaveBeenCalledWith(roasterUser.id)
      expect(getAllUsersOrThrow).not.toHaveBeenCalled()
    })

    it('lets an Admin without the Roaster role sell their own stock, with no seller sent', async () => {
      vi.mocked(createSaleOrder).mockResolvedValue({
        saleOrder: sale({ id: 'sale-new', createdBy: adminUser.id }),
        affectedRoastBatches: [],
        affectedInventoryItems: [],
      })
      renderModal({ initialCustomerId: 'cust-1' }, adminData())
      choose('Sell for', 'Me (Admin)')
      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(getSellableRoasts).toHaveBeenCalledWith(undefined)
      expect(getSellableGreenLots).toHaveBeenCalledWith(undefined)

      choose('Item for line 1', /RB-0421/)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1' } })
      fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '300' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

      await waitFor(() => expect(createSaleOrder).toHaveBeenCalled())
      expect(vi.mocked(createSaleOrder).mock.calls[0][0]).not.toHaveProperty('sellerId')
    })

    it('blocks the sale until a roaster is picked', async () => {
      renderModal({ initialCustomerId: 'cust-1' }, adminData())
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

      expect(within(group('Sell for')).getByText('Choose a roaster to sell for')).toBeInTheDocument()
      expect(createSaleOrder).not.toHaveBeenCalled()
    })

    it("records the sale for the picked roaster, with sellerId, from that roaster's stock", async () => {
      vi.mocked(createSaleOrder).mockResolvedValue({
        saleOrder: sale({ id: 'sale-new' }),
        affectedRoastBatches: [],
        affectedInventoryItems: [],
      })
      renderModal({ initialCustomerId: 'cust-1' }, adminData())
      choose('Sell for', 'Anchor Roasters')
      await screen.findByRole('group', { name: 'Item for line 1' })

      choose('Item for line 1', /RB-0900/)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '1.5' } })
      fireEvent.change(screen.getByLabelText('Price / kg'), { target: { value: '400' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record sale' }))

      await waitFor(() => expect(createSaleOrder).toHaveBeenCalled())
      expect(vi.mocked(createSaleOrder).mock.calls[0][0]).toEqual({
        customerId: 'cust-1',
        orderDate: today(),
        currency: 'THB',
        notes: null,
        items: [{ roastBatchId: 'rb-9', quantity: 1.5, pricePerKg: 400 }],
        sellerId: anchor.id,
      })
    })

    it("starts the lines over and loads the other roaster's stock when the seller changes", async () => {
      renderModal({ initialCustomerId: 'cust-1' }, adminData())
      choose('Sell for', 'Bean Roasters')
      await screen.findByRole('group', { name: 'Item for line 1' })
      choose('Item for line 1', /RB-0421/)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add line' }))

      choose('Sell for', 'Anchor Roasters')
      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(screen.queryByRole('group', { name: 'Item for line 2' })).not.toBeInTheDocument()
      expect(within(group('Item for line 1')).getAllByRole('button')[0]).toHaveTextContent(
        'Choose roasted coffee or green beans',
      )
      expect(screen.getByLabelText('Kg')).toHaveValue('')
      expect(getSellableRoasts).toHaveBeenLastCalledWith(anchor.id)
      expect(getSellableGreenLots).toHaveBeenLastCalledWith(anchor.id)

      fireEvent.click(within(group('Item for line 1')).getAllByRole('button')[0])
      expect(within(group('Item for line 1')).getByRole('button', { name: /RB-0900/ })).toBeInTheDocument()
      expect(within(group('Item for line 1')).queryByRole('button', { name: /RB-0421/ })).not.toBeInTheDocument()
    })

    it("prefers the price from the seller's own earlier sales", async () => {
      // Newest: another roaster sold the same green lot at 999. Older: the
      // seller sold it at 450.
      const otherSale = sale({
        id: 'other',
        orderDate: '2026-09-21',
        createdBy: anchor.id,
        items: [saleItem({ pricePerKg: 999, roast: roast({ id: 'rb-77', greenBeanLotId: 'gbl-1' }) })],
      })
      const ownSale = sale({
        id: 'own',
        orderDate: '2026-09-01',
        createdBy: roasterUser.id,
        items: [saleItem({ pricePerKg: 450, roast: roast({ id: 'rb-55', greenBeanLotId: 'gbl-1' }) })],
      })
      renderModal({ initialCustomerId: 'cust-1' }, adminData({ saleOrders: [otherSale, ownSale] }))
      choose('Sell for', 'Bean Roasters')
      await screen.findByRole('group', { name: 'Item for line 1' })

      choose('Item for line 1', /RB-0421/)
      expect(screen.getByLabelText('Price / kg')).toHaveValue('450')
    })

    it("switches to the picked seller's last currency until one is chosen by hand", async () => {
      const usdSale = sale({ id: 'usd', createdBy: anchor.id, currency: 'USD' })
      renderModal({ initialCustomerId: 'cust-1' }, adminData({ saleOrders: [usdSale] }))
      const currencyButton = () => within(group('Currency')).getAllByRole('button')[0]
      expect(currencyButton()).toHaveTextContent('THB')

      choose('Sell for', 'Anchor Roasters')
      expect(currencyButton()).toHaveTextContent('USD')
      choose('Sell for', 'Bean Roasters')
      expect(currencyButton()).toHaveTextContent('THB')

      choose('Currency', 'EUR')
      choose('Sell for', 'Anchor Roasters')
      expect(currencyButton()).toHaveTextContent('EUR')
      await screen.findByRole('group', { name: 'Item for line 1' })
    })

    it('says when the roasters cannot be loaded and loads them on Retry', async () => {
      vi.mocked(getAllUsersOrThrow)
        .mockRejectedValueOnce(new Error('Server unavailable'))
        .mockResolvedValueOnce([anchor, farmer])
      renderModal({ initialCustomerId: 'cust-1' }, adminData({ users: [] }))

      const alert = await within(group('Sell for')).findByRole('alert')
      expect(alert).toHaveTextContent("Couldn't load the roasters.")
      // The Admin can still sell their own stock meanwhile.
      fireEvent.click(within(group('Sell for')).getAllByRole('button')[0])
      expect(within(group('Sell for')).getByRole('button', { name: 'Me (Admin)' })).toBeInTheDocument()
      expect(within(group('Sell for')).queryByRole('button', { name: 'Anchor Roasters' })).not.toBeInTheDocument()
      fireEvent.click(within(group('Sell for')).getAllByRole('button')[0])

      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
      await waitFor(() =>
        expect(within(group('Sell for')).queryByRole('alert')).not.toBeInTheDocument(),
      )
      choose('Sell for', 'Anchor Roasters')
      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(getAllUsersOrThrow).toHaveBeenCalledTimes(2)
      expect(getSellableRoasts).toHaveBeenCalledWith(anchor.id)
    })

    it('loads the roasters when the app data has no users', async () => {
      vi.mocked(getAllUsersOrThrow).mockResolvedValue([anchor, farmer])
      renderModal({ initialCustomerId: 'cust-1' }, adminData({ users: [] }))

      expect(within(group('Sell for')).getByRole('button')).toHaveTextContent('Loading roasters…')
      await waitFor(() =>
        expect(within(group('Sell for')).getByRole('button')).toHaveTextContent('Choose a roaster'),
      )
      choose('Sell for', 'Anchor Roasters')
      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(getSellableRoasts).toHaveBeenCalledWith(anchor.id)
    })

    it('uses the seller handed over, without a picker', async () => {
      renderModal({ initialCustomerId: 'cust-1', sellerId: anchor.id }, adminData())

      await screen.findByRole('group', { name: 'Item for line 1' })
      expect(screen.queryByRole('group', { name: 'Sell for' })).not.toBeInTheDocument()
      expect(getSellableRoasts).toHaveBeenCalledWith(anchor.id)
      expect(getSellableGreenLots).toHaveBeenCalledWith(anchor.id)
    })

    it("edits a roaster's sale from that roaster's stock and never sends a seller", async () => {
      const order = sale({ items: [saleItem({ quantity: 2, pricePerKg: 500, roast: roast({ id: 'rb-1' }) })] })
      vi.mocked(updateSaleOrder).mockResolvedValue({
        saleOrder: order,
        affectedRoastBatches: [],
        affectedInventoryItems: [],
      })
      renderModal({ order }, adminData({ saleOrders: [order] }))
      await screen.findByRole('group', { name: 'Item for line 1' })

      expect(screen.queryByRole('group', { name: 'Sell for' })).not.toBeInTheDocument()
      expect(getSellableRoasts).toHaveBeenCalledWith(roasterUser.id)
      fireEvent.change(screen.getByLabelText('Kg'), { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(updateSaleOrder).toHaveBeenCalled())
      expect(vi.mocked(updateSaleOrder).mock.calls[0][1]).not.toHaveProperty('sellerId')
    })
  })

  describe('New customer', () => {
    const created: Customer = customer({ id: 'cust-new', name: 'Blue Door', type: 'Distributor' })

    const fillAndCreate = () => {
      const dialog = screen.getByRole('dialog', { name: 'Create New Customer' })
      fireEvent.change(within(dialog).getByLabelText('Customer Name *'), { target: { value: 'Blue Door' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create Customer' }))
    }

    it('adds a customer from the Sell popup and picks it', async () => {
      vi.mocked(addCustomer).mockResolvedValue(created)
      const { handle } = renderModal({ initialCustomerId: 'cust-1' })

      fireEvent.click(screen.getByRole('button', { name: 'New customer' }))
      fillAndCreate()

      await waitFor(() =>
        expect(within(group('Customer')).getByRole('button')).toHaveTextContent('Blue Door (Distributor)'),
      )
      await waitFor(() => expect(handle.current.customers.map((c) => c.id)).toEqual(['cust-new', 'cust-1']))
      expect(addCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Blue Door' }))
    })

    it('closes only the New customer popup on Escape and keeps the sale as typed', async () => {
      const { onClose } = renderModal({ initialCustomerId: 'cust-1' })
      fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Pick up Friday' } })

      fireEvent.click(screen.getByRole('button', { name: 'New customer' }))
      expect(screen.getByRole('dialog', { name: 'Create New Customer' })).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('dialog', { name: 'Create New Customer' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Sell coffee' })).toBeInTheDocument()
      expect(screen.getByLabelText('Notes')).toHaveValue('Pick up Friday')
      expect(onClose).not.toHaveBeenCalled()
      await screen.findByRole('group', { name: 'Item for line 1' })
    })

    it('adds but does not pick a customer saved after its popup was closed', async () => {
      let resolve: (c: Customer) => void = () => {}
      vi.mocked(addCustomer).mockReturnValue(new Promise<Customer>((r) => (resolve = r)))
      const { handle } = renderModal({ initialCustomerId: 'cust-1' })

      fireEvent.click(screen.getByRole('button', { name: 'New customer' }))
      fillAndCreate()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Create New Customer' })).not.toBeInTheDocument()
      resolve(created)

      await waitFor(() => expect(handle.current.customers.map((c) => c.id)).toContain('cust-new'))
      expect(within(group('Customer')).getByRole('button')).toHaveTextContent('Cafe Aroma (Retailer)')
    })
  })

  describe('embedded in the Start roast popup', () => {
    const renderEmbedded = () =>
      render(
        <MemoryRouter>
          <TestDataProvider initial={appData({ customers: [customer()] })}>
            <SaleOrderForm embedded initialCustomerId="cust-1" onClose={vi.fn()} />
          </TestDataProvider>
        </MemoryRouter>,
      )

    it('draws no dialog or title of its own and uses the roaster colours', async () => {
      renderEmbedded()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('Sell coffee')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Record sale' })).toHaveClass('bg-[#2e6848]')
      await screen.findByRole('group', { name: 'Item for line 1' })
    })

    it('leaves out Go to Roaster Workbench when there is nothing to sell', async () => {
      vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [], missingWeightCount: 0 })
      renderEmbedded()

      expect(await screen.findByText(/Nothing left to sell/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Go to Roaster Workbench' })).not.toBeInTheDocument()
      // Already in the Roaster Workbench, so the copy does not send the roaster there.
      expect(screen.queryByText(/in the Roaster Workbench/)).not.toBeInTheDocument()
    })

    it('still offers Go to Roaster Workbench in the Sell popup', async () => {
      vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [], missingWeightCount: 0 })
      renderModal({ initialCustomerId: 'cust-1' })

      expect(await screen.findByText(/Nothing left to sell/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to Roaster Workbench' })).toBeInTheDocument()
    })
  })
})
