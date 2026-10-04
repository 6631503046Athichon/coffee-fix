import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../../constants'
import { DataContext } from '../../../hooks/useDataContext'
import { GreenBeanSourceType, ParchmentSourceType } from '../../../types'
import type { AppData, Customer, GreenBeanLot, ParchmentLot } from '../../../types'
import { api } from '../../../services/api'
import EditWithdrawalModal from './EditWithdrawalModal'
import type { EditWithdrawalModalProps } from './EditWithdrawalModal'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// D7: a recorded Sale's customer, address, price, currency and invoice
// number are edited in place; only what changed is sent.

const customers: Customer[] = [
  { id: 'c-1', name: 'Cafe Doi', type: 'Retailer', address: 'Doi shop' },
  { id: 'c-2', name: 'Bean Bar', type: 'Distributor', address: 'Bar street' },
]
const saleRow = {
  id: 'w-1', amountKg: 5, withdrawalType: 'Sale' as const, date: '2026-09-20',
  customerName: 'Cafe Doi', deliveryAddress: 'Doi shop', salePrice: 400, currency: 'THB',
  totalAmount: 2000, invoiceNumber: 'INV-1',
}
const lot: GreenBeanLot = {
  id: 'gbl-1', displayId: 'GBL-2026-9', sourceType: GreenBeanSourceType.Internal, createdById: 'p-1',
  grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 45, availabilityStatus: 'Available',
  cuppingScores: [], withdrawalHistory: [saleRow],
}

function Harness(props: Omit<EditWithdrawalModalProps, 'onClose'> & { onClose?: () => void }) {
  const [data, setData] = useState<AppData>({ ...INITIAL_APP_DATA, customers })
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
      <EditWithdrawalModal onClose={() => {}} {...props} />
    </DataContext.Provider>
  )
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

describe('EditWithdrawalModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the recorded sale with its customer picked', () => {
    render(<Harness target={{ kind: 'greenBean', lot, withdrawal: saleRow }} onSaved={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Edit sale' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cafe Doi (Retailer)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Delivery Address')).toHaveValue('Doi shop')
    expect(screen.getByLabelText('Price per kg')).toHaveValue(400)
    expect(screen.getByLabelText('Invoice number')).toHaveValue('INV-1')
    expect(screen.getByTestId('edit-sale-total')).toHaveTextContent('2,000.00 THB')
  })

  it('sends only the changed price and invoice number and hands back the row', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      withdrawal: { ...saleRow, salePrice: 410, totalAmount: 2050, invoiceNumber: 'INV-9', date: '2026-09-20T00:00:00.000Z' },
      message: 'Withdrawal updated',
    })
    const onSaved = vi.fn()
    render(<Harness target={{ kind: 'greenBean', lot, withdrawal: saleRow }} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '410' } })
    fireEvent.change(screen.getByLabelText('Invoice number'), { target: { value: 'INV-9' } })
    expect(screen.getByTestId('edit-sale-total')).toHaveTextContent('2,050.00 THB')
    save()

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/green-bean-lots/gbl-1/withdrawals/w-1', { salePrice: 410, invoiceNumber: 'INV-9' })
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      kind: 'greenBean',
      withdrawal: { id: 'w-1', salePrice: 410, totalAmount: 2050, invoiceNumber: 'INV-9', date: '2026-09-20' },
    })
  })

  it('picks another customer with the customer picker, which fills the address', async () => {
    vi.mocked(api.patch).mockResolvedValue({ withdrawal: saleRow })
    render(<Harness target={{ kind: 'greenBean', lot, withdrawal: saleRow }} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cafe Doi (Retailer)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bean Bar (Distributor)' }))
    save()
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/green-bean-lots/gbl-1/withdrawals/w-1', {
      customerName: 'Bean Bar', deliveryAddress: 'Bar street',
    })
  })

  it('closes without a request when nothing changed', () => {
    const onClose = vi.fn()
    render(<Harness target={{ kind: 'greenBean', lot, withdrawal: saleRow }} onSaved={vi.fn()} onClose={onClose} />)
    save()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('refuses a price that is not above 0 before sending', () => {
    render(<Harness target={{ kind: 'greenBean', lot, withdrawal: saleRow }} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Price per kg'), { target: { value: '0' } })
    save()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a price per kg above 0, or leave it empty.')
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('keeps a customer name that is not in the list, and can remove it', async () => {
    vi.mocked(api.patch).mockResolvedValue({ withdrawal: saleRow })
    const row = { ...saleRow, customerName: 'Gone Ltd' }
    render(<Harness target={{ kind: 'greenBean', lot, withdrawal: row }} onSaved={vi.fn()} />)
    expect(screen.getByTestId('unlisted-customer')).toHaveTextContent('On record: Gone Ltd')
    fireEvent.click(screen.getByRole('button', { name: 'remove it' }))
    expect(screen.queryByTestId('unlisted-customer')).not.toBeInTheDocument()
    save()
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/green-bean-lots/gbl-1/withdrawals/w-1', { customerName: null })
  })

  it('saves a parchment sale through the parchment route', async () => {
    const parchment: ParchmentLot = {
      id: 'pl-1', displayId: 'PL-2026-3', processingBatchId: 'pb-1', sourceType: ParchmentSourceType.Internal,
      initialWeightKg: 100, currentWeightKg: 80, moistureContent: 11, processType: 'Washed', status: 'AwaitingHulling',
    }
    const row = { id: 'pw-1', amountKg: 20, withdrawalType: 'Sale' as const, date: '2026-09-20T00:00:00.000Z' }
    vi.mocked(api.patch).mockResolvedValue({ withdrawal: { ...row, invoiceNumber: 'INV-4' } })
    const onSaved = vi.fn()
    render(<Harness target={{ kind: 'parchment', lot: parchment, withdrawal: row }} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('Invoice number'), { target: { value: 'INV-4' } })
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/parchment-lots/pl-1/withdrawals/pw-1', { invoiceNumber: 'INV-4' })
    expect(onSaved.mock.calls[0][0]).toMatchObject({ kind: 'parchment', withdrawal: { invoiceNumber: 'INV-4' } })
  })
})
