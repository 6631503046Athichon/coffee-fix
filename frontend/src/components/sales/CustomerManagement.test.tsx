import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../types'
import { addCustomer, getAllCustomers } from '../../services/sales/customerService'
import { getSellableGreenLots, getSellableRoasts } from '../../services/sales/saleOrderService'
import { TestDataProvider, appData, customer, roasterUser, sellable } from '../../test/salesFixtures'
import type { TestDataHandle } from '../../test/salesFixtures'
import CustomerManagement from './CustomerManagement'

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
vi.mock('../../services/sales/customerService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/sales/customerService')>()),
  getAllCustomers: vi.fn(),
  deleteCustomer: vi.fn(),
  addCustomer: vi.fn(),
}))
vi.mock('../../services/sales/saleOrderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/sales/saleOrderService')>()),
  getSellableRoasts: vi.fn(),
  getSellableGreenLots: vi.fn(),
}))

const aroma = customer({ id: 'cust-1', name: 'Cafe Aroma' })
// Added by another roaster after this app last loaded its data.
const blueDoor = customer({ id: 'cust-2', name: 'Blue Door', type: 'Distributor' })

describe('CustomerManagement', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.currentUser = roasterUser
    vi.mocked(getAllCustomers).mockResolvedValue([blueDoor, aroma])
    vi.mocked(getSellableRoasts).mockResolvedValue({ roasts: [sellable()], missingWeightCount: 0 })
    vi.mocked(getSellableGreenLots).mockResolvedValue([])
  })

  it('brings the app data up to date with the list it shows, so Sell finds the customer', async () => {
    const handle: TestDataHandle = { current: appData({ customers: [aroma] }) }
    render(
      <MemoryRouter initialEntries={['/customers']}>
        <TestDataProvider initial={handle.current} dataRef={handle}>
          <CustomerManagement />
        </TestDataProvider>
      </MemoryRouter>,
    )

    const row = await screen.findByRole('row', { name: /Blue Door/ })
    await waitFor(() => expect(handle.current.customers.map((c) => c.id)).toEqual(['cust-2', 'cust-1']))

    fireEvent.click(within(row).getByRole('button', { name: 'Sell' }))
    const dialog = screen.getByRole('dialog', { name: 'Sell coffee' })
    expect(within(within(dialog).getByRole('group', { name: 'Customer' })).getByRole('button')).toHaveTextContent(
      'Blue Door (Distributor)',
    )
    expect(within(dialog).queryByText('No customers yet')).not.toBeInTheDocument()
    await within(dialog).findByRole('group', { name: 'Item for line 1' })
  })

  it('shows a customer added with New customer in the Sell popup once that popup closes', async () => {
    const created = customer({ id: 'cust-new', name: 'Green Leaf' })
    vi.mocked(addCustomer).mockResolvedValue(created)
    render(
      <MemoryRouter initialEntries={['/customers']}>
        <TestDataProvider initial={appData({ customers: [aroma] })}>
          <CustomerManagement />
        </TestDataProvider>
      </MemoryRouter>,
    )

    const row = await screen.findByRole('row', { name: /Blue Door/ })
    fireEvent.click(within(row).getByRole('button', { name: 'Sell' }))
    const dialog = screen.getByRole('dialog', { name: 'Sell coffee' })
    // From here on the server lists it too.
    vi.mocked(getAllCustomers).mockResolvedValue([blueDoor, aroma, created])
    fireEvent.click(within(dialog).getByRole('button', { name: 'New customer' }))
    const create = screen.getByRole('dialog', { name: 'Create New Customer' })
    fireEvent.change(within(create).getByLabelText('Customer Name *'), { target: { value: 'Green Leaf' } })
    fireEvent.click(within(create).getByRole('button', { name: 'Create Customer' }))
    await waitFor(() =>
      expect(within(within(dialog).getByRole('group', { name: 'Customer' })).getByRole('button')).toHaveTextContent(
        'Green Leaf',
      ),
    )
    expect(screen.queryByRole('row', { name: /Green Leaf/ })).not.toBeInTheDocument()

    // The sale is not recorded.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('row', { name: /Green Leaf/ })).toBeInTheDocument()
  })
})
