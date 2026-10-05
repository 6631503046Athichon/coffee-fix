import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaleOrder, User } from '../../../types'
import { deleteSaleOrder, updateSaleOrder } from '../../../services/sales/saleOrderService'
import type { RoasterInventoryItem } from '../../../types'
import {
  TestDataProvider,
  adminUser,
  appData,
  greenStock,
  roast,
  roasterUser,
  sale,
  saleItem,
} from '../../../test/salesFixtures'
import type { TestDataHandle } from '../../../test/salesFixtures'
import SaleDetailsModal from './SaleDetailsModal'

const { auth, addToast } = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  addToast: vi.fn(),
}))

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../../../services/sales/saleOrderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/sales/saleOrderService')>()),
  updateSaleOrder: vi.fn(),
  deleteSaleOrder: vi.fn(),
}))

const twoLineSale = sale({
  items: [
    saleItem({ id: 'l1', quantity: 2.5, roast: roast({ id: 'rb-1', label: 'RB-0421' }) }),
    saleItem({ id: 'l2', quantity: 1, roast: roast({ id: 'rb-2', label: 'RB-0107' }) }),
  ],
})

const mixedSale = sale({
  items: [
    saleItem({ id: 'l1', quantity: 2.5, roast: roast({ id: 'rb-1', label: 'RB-0421' }) }),
    saleItem({ id: 'l2', quantity: 5, pricePerKg: 320, green: greenStock({ id: 'inv-1', label: 'ROA-4412' }) }),
  ],
})

const stockRow: RoasterInventoryItem = {
  id: 'inv-1',
  roasterId: roasterUser.id,
  greenBeanLotId: 'gbl-9',
  claimedWeightKg: 20,
  remainingWeightKg: 7,
}

const renderDetails = (
  order: SaleOrder = twoLineSale,
  initialMode?: 'view' | 'confirm-delete',
) => {
  const handle: TestDataHandle = {
    current: appData({ saleOrders: [order], roasterInventory: [stockRow] }),
  }
  const onClose = vi.fn()
  const onEdit = vi.fn()
  const refreshData = vi.fn(async () => {})
  const view = render(
    <TestDataProvider initial={handle.current} dataRef={handle} refreshData={refreshData}>
      <SaleDetailsModal order={order} initialMode={initialMode} onClose={onClose} onEdit={onEdit} />
    </TestDataProvider>,
  )
  return { ...view, handle, onClose, onEdit, refreshData }
}

describe('SaleDetailsModal', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.currentUser = roasterUser
  })
  afterEach(() => {
    document.getElementById('sale-print-root')?.remove()
    document.body.classList.remove('printing-sale-receipt')
  })

  it('shows the sale with its customer snapshot and lines', () => {
    renderDetails()
    const dialog = screen.getByRole('dialog', { name: 'Sale ORD-2026-0001' })

    expect(within(dialog).getByText('Cafe Aroma')).toBeInTheDocument()
    expect(within(dialog).getByText('081 234 5678')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Grade A Typica Washed')).toHaveLength(2)
    expect(within(dialog).getByText('1,750.00 THB')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Seller:/)).not.toBeInTheDocument()
  })

  it('numbers the lines in one Coffee box with the total under them', () => {
    renderDetails()
    const lines = screen.getByRole('region', { name: 'Coffee' })

    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(lines).toHaveTextContent('2 lines')
    expect(within(lines).getByText('1,750.00 THB')).toBeInTheDocument()
  })

  it('names the seller for an admin, not as who recorded the sale', () => {
    auth.currentUser = adminUser
    renderDetails()
    // The sale is the roaster's (createdBy), also when an Admin recorded it for them.
    expect(screen.getByText(/Seller: Bean Roasters/)).toBeInTheDocument()
    expect(screen.queryByText(/Recorded by/)).not.toBeInTheDocument()
  })

  it('asks before cancelling and says what goes back to stock', async () => {
    const cancelled = { ...twoLineSale, status: 'Cancelled' as const, updatedAt: '2026-09-21T00:00:00.000Z' }
    vi.mocked(updateSaleOrder).mockResolvedValue({
      saleOrder: cancelled,
      affectedRoastBatches: [{ id: 'rb-1', soldWeightKg: 0, availableKg: 10 }],
      affectedInventoryItems: [],
    })
    const { handle } = renderDetails()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Cancel sale ORD-2026-0001?' })
    expect(confirm).toHaveTextContent('2.5 kg back to RB-0421, 1 kg back to RB-0107.')
    expect(confirm).not.toHaveTextContent('marked Delivered')
    expect(updateSaleOrder).not.toHaveBeenCalled()

    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel sale' }))
    await waitFor(() =>
      expect(updateSaleOrder).toHaveBeenCalledWith('sale-1', {
        status: 'Cancelled',
        expectedUpdatedAt: '2026-09-20T03:00:00.000Z',
      }),
    )
    await waitFor(() => expect(handle.current.saleOrders[0].status).toBe('Cancelled'))
  })

  it('warns before cancelling a delivered sale', () => {
    renderDetails({ ...twoLineSale, status: 'Delivered' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'This sale is marked Delivered — only cancel it if the coffee came back.',
    )
  })

  it('changes other statuses at once and shows a refusal inline', async () => {
    vi.mocked(updateSaleOrder).mockRejectedValueOnce(
      new Error('Not enough roasted coffee left in RB-0421: at most 1 kg can go on this sale, 2.5 kg asked.'),
    )
    renderDetails({ ...twoLineSale, status: 'Cancelled' })

    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('at most 1 kg can go on this sale')
    expect(updateSaleOrder).toHaveBeenCalledWith('sale-1', {
      status: 'Confirmed',
      expectedUpdatedAt: '2026-09-20T03:00:00.000Z',
    })
  })

  it('confirms a delete with what goes back to stock and the invoices that go too', async () => {
    vi.mocked(deleteSaleOrder).mockResolvedValue({
      affectedRoastBatches: [],
      affectedInventoryItems: [],
      deletedInvoices: 2,
    })
    const { handle, onClose } = renderDetails({ ...twoLineSale, invoiceCount: 2, status: 'Delivered' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete sale ORD-2026-0001?' })
    expect(confirm).toHaveTextContent('2.5 kg back to RB-0421, 1 kg back to RB-0107.')
    expect(confirm).toHaveTextContent('This sale is marked Delivered')
    expect(confirm).toHaveTextContent('Its 2 invoices are deleted too.')

    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete sale' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(deleteSaleOrder).toHaveBeenCalledWith('sale-1', '2026-09-20T03:00:00.000Z')
    expect(handle.current.saleOrders).toEqual([])
    expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Sale ORD-2026-0001 deleted' })
  })

  it('opens straight on the delete confirmation and says nothing returns for a cancelled sale', () => {
    renderDetails({ ...twoLineSale, status: 'Cancelled' }, 'confirm-delete')
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Nothing goes back to stock because the sale is cancelled.',
    )
  })

  it('removes the sale locally when the server no longer has it', async () => {
    vi.mocked(deleteSaleOrder).mockRejectedValue(new Error('Sale not found'))
    const { handle, onClose, refreshData } = renderDetails(twoLineSale, 'confirm-delete')

    fireEvent.click(screen.getByRole('button', { name: 'Delete sale' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(handle.current.saleOrders).toEqual([])
    expect(refreshData).toHaveBeenCalled()
  })

  it('puts the receipt in #sale-print-root while open and prints it', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { unmount } = renderDetails()

    const root = document.getElementById('sale-print-root')
    expect(root?.parentElement).toBe(document.body)
    expect(document.body).toHaveClass('printing-sale-receipt')
    expect(within(root as HTMLElement).getByText('Receipt')).toBeInTheDocument()
    expect(within(root as HTMLElement).getByText('Bill to')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }))
    expect(print).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.getElementById('sale-print-root')).toBeNull()
    expect(document.body).not.toHaveClass('printing-sale-receipt')
    print.mockRestore()
  })

  it('shows a green-bean line with its lot, the Green beans tag and the GBL id', () => {
    renderDetails(mixedSale)
    const dialog = screen.getByRole('dialog', { name: 'Sale ORD-2026-0001' })

    expect(within(dialog).getByText('ROA-4412')).toBeInTheDocument()
    expect(within(dialog).getByText('Green beans')).toBeInTheDocument()
    expect(within(dialog).getByText('GBL-2026-9')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Grade A Typica Washed')).toHaveLength(2)
  })

  it('says green kg go back to the stock row, and passes the stock changes on', async () => {
    vi.mocked(updateSaleOrder).mockResolvedValue({
      saleOrder: { ...mixedSale, status: 'Cancelled', updatedAt: '2026-09-21T00:00:00.000Z' },
      affectedRoastBatches: [],
      affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 12 }],
    })
    const { handle } = renderDetails(mixedSale)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Cancel sale ORD-2026-0001?' })
    expect(confirm).toHaveTextContent('2.5 kg back to RB-0421, 5 kg of green beans back to ROA-4412.')

    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel sale' }))
    await waitFor(() => expect(handle.current.roasterInventory[0].remainingWeightKg).toBe(12))
  })

  it('names the green kg a delete gives back and patches the stock row', async () => {
    vi.mocked(deleteSaleOrder).mockResolvedValue({
      affectedRoastBatches: [],
      affectedInventoryItems: [{ id: 'inv-1', remainingWeightKg: 12 }],
      deletedInvoices: 0,
    })
    const { handle, onClose } = renderDetails(mixedSale, 'confirm-delete')

    const confirm = screen.getByRole('alertdialog', { name: 'Delete sale ORD-2026-0001?' })
    expect(confirm).toHaveTextContent('5 kg of green beans back to ROA-4412')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete sale' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    await waitFor(() => expect(handle.current.roasterInventory[0].remainingWeightKg).toBe(12))
  })

  it('prints a green-bean line as Green beans with its lot', () => {
    renderDetails(mixedSale)
    const receipt = document.getElementById('sale-print-root') as HTMLElement

    expect(within(receipt).getByRole('columnheader', { name: 'Item' })).toBeInTheDocument()
    expect(within(receipt).getByText('Green beans')).toBeInTheDocument()
    expect(within(receipt).getByText('ROA-4412 · GBL-2026-9')).toBeInTheDocument()
  })

  it('hands the sale to onEdit', () => {
    const { onEdit } = renderDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(twoLineSale)
  })
})
