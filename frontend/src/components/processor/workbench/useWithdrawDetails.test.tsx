import React, { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../../constants'
import { DataContext } from '../../../hooks/useDataContext'
import type { AppData, Customer } from '../../../types'
import { updateCustomer } from '../../../services/sales/customerService'
import WithdrawDetailsFields from './WithdrawDetailsFields'
import { applyEditedWithdrawCustomer, useWithdrawDetails } from './useWithdrawDetails'
import { EMPTY_WITHDRAW_DETAILS } from './withdrawDetails'

// The Withdraw Stock Sale fields offer "Edit" next to the picked customer
// (owner decision D3): it opens the customer edit popup, saves through
// PUT /customers/:id and updates the app's customer list.

vi.mock('../../../services/sales/customerService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../services/sales/customerService')>(),
  updateCustomer: vi.fn(),
}))

const cafe: Customer = { id: 'c-1', name: 'Cafe Doi', type: 'Retailer', address: '12 Nimman Rd' }
const hill: Customer = { id: 'c-2', name: 'Hill Roasters', type: 'Roaster' }

function Fields() {
  const withdrawDetails = useWithdrawDetails()
  return (
    <>
      <WithdrawDetailsFields type="Sale" {...withdrawDetails.fieldsProps} />
      {withdrawDetails.newCustomerModal}
    </>
  )
}

function Harness({ onData }: { onData?: (data: AppData) => void }) {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, customers: [cafe, hill] })
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
      <Fields />
    </DataContext.Provider>
  )
}

const customerGroup = () => screen.getByRole('group', { name: 'Customer' })
const pick = (current: string, option: string) => {
  fireEvent.click(within(customerGroup()).getByRole('button', { name: current }))
  fireEvent.click(within(customerGroup()).getByRole('button', { name: option }))
}
const address = () => screen.getByLabelText('Delivery Address') as HTMLInputElement

describe('Withdraw Stock: Edit customer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows Edit only once a customer is picked', () => {
    render(<Harness />)
    expect(within(customerGroup()).queryByRole('button', { name: /Edit customer/ })).not.toBeInTheDocument()

    pick('Select customer...', 'Cafe Doi (Retailer)')
    expect(within(customerGroup()).getByRole('button', { name: 'Edit customer Cafe Doi' })).toHaveTextContent('Edit')

    pick('Cafe Doi (Retailer)', 'No customer')
    expect(within(customerGroup()).queryByRole('button', { name: /Edit customer/ })).not.toBeInTheDocument()
  })

  it('edits the picked customer in a popup and updates the list, the picker and the filled-in address', async () => {
    vi.mocked(updateCustomer).mockResolvedValue({ ...cafe, name: 'Cafe Doi Roastery', address: '99 Nimman Rd' })
    const onData = vi.fn()
    render(<Harness onData={onData} />)
    pick('Select customer...', 'Cafe Doi (Retailer)')
    expect(address().value).toBe('12 Nimman Rd')

    fireEvent.click(within(customerGroup()).getByRole('button', { name: 'Edit customer Cafe Doi' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Customer: Cafe Doi' })
    const name = within(dialog).getByLabelText('Customer Name *') as HTMLInputElement
    expect(name.value).toBe('Cafe Doi')
    fireEvent.change(name, { target: { value: 'Cafe Doi Roastery' } })
    fireEvent.change(within(dialog).getByPlaceholderText('123 Main St, City, Country'), {
      target: { value: '99 Nimman Rd' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateCustomer).mock.calls[0][0]).toBe('c-1')
    expect(vi.mocked(updateCustomer).mock.calls[0][1]).toMatchObject({
      name: 'Cafe Doi Roastery',
      type: 'Retailer',
      address: '99 Nimman Rd',
    })

    expect(
      await within(customerGroup()).findByRole('button', { name: 'Cafe Doi Roastery (Retailer)' }),
    ).toBeInTheDocument()
    expect(address().value).toBe('99 Nimman Rd')
    await waitFor(() =>
      expect(onData.mock.lastCall![0].customers).toEqual([
        { ...cafe, name: 'Cafe Doi Roastery', address: '99 Nimman Rd' },
        hill,
      ]),
    )
    // The popup closes itself after the success message.
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: /Edit Customer/ })).not.toBeInTheDocument(),
      { timeout: 3000 },
    )
  }, 15000)

  it('keeps a delivery address typed by hand', async () => {
    vi.mocked(updateCustomer).mockResolvedValue({ ...cafe, address: '99 Nimman Rd' })
    render(<Harness />)
    pick('Select customer...', 'Cafe Doi (Retailer)')
    fireEvent.change(address(), { target: { value: 'Warehouse 3, Lampang' } })

    fireEvent.click(within(customerGroup()).getByRole('button', { name: 'Edit customer Cafe Doi' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Customer: Cafe Doi' })
    fireEvent.change(within(dialog).getByPlaceholderText('123 Main St, City, Country'), {
      target: { value: '99 Nimman Rd' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1))
    await screen.findByText('Customer "Cafe Doi" updated successfully!')
    expect(address().value).toBe('Warehouse 3, Lampang')
  })

  it('leaves everything as it was when the save fails', async () => {
    vi.mocked(updateCustomer).mockRejectedValue(new Error('Insufficient permissions'))
    const onData = vi.fn()
    render(<Harness onData={onData} />)
    pick('Select customer...', 'Cafe Doi (Retailer)')

    fireEvent.click(within(customerGroup()).getByRole('button', { name: 'Edit customer Cafe Doi' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Customer: Cafe Doi' })
    fireEvent.change(within(dialog).getByLabelText('Customer Name *'), { target: { value: 'Typo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    expect(await within(dialog).findByText('Insufficient permissions')).toBeInTheDocument()
    expect(within(customerGroup()).getByRole('button', { name: 'Cafe Doi (Retailer)' })).toBeInTheDocument()
    expect(onData.mock.lastCall![0].customers).toEqual([cafe, hill])
  })
})

describe('applyEditedWithdrawCustomer', () => {
  const picked = { ...EMPTY_WITHDRAW_DETAILS, customerId: 'c-1', customerName: 'Cafe Doi', deliveryAddress: '12 Nimman Rd' }

  it('renames the picked customer and follows its new address', () => {
    expect(applyEditedWithdrawCustomer(picked, { ...cafe, name: 'Cafe Doi 2', address: undefined }, [cafe, hill]))
      .toEqual({ ...picked, customerName: 'Cafe Doi 2', deliveryAddress: '' })
  })

  it('leaves the details alone when another customer was edited', () => {
    expect(applyEditedWithdrawCustomer(picked, { ...hill, name: 'Hill 2' }, [cafe, hill])).toBe(picked)
  })
})
