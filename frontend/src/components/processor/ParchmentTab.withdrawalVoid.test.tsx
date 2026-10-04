import React, { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { GreenBeanSourceType, ParchmentSourceType, UserRole } from '../../types'
import type { AppData, GreenBeanLot, GreenBeanWithdrawalRecord, ParchmentLot } from '../../types'
import {
  updateGreenBeanWithdrawal,
  voidGreenBeanWithdrawal,
} from '../../services/lots/greenBeanLotService'
import ParchmentTab from './ParchmentTab'

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  voidGreenBeanWithdrawal: vi.fn(),
  updateGreenBeanWithdrawal: vi.fn(),
}))

// D7 on the Parchment page: Source History lists each source lot's
// withdrawals; the lot's owner (or Admin) can Void one or edit a Sale, and a
// voided one stays, struck through with a "Voided" tag.

const washed: ParchmentLot = {
  id: 'pl-w', displayId: 'PL-2026-3', processingBatchId: 'pb-1', harvestLotId: 'hl-1',
  sourceType: ParchmentSourceType.Internal, initialWeightKg: 100, currentWeightKg: 0,
  moistureContent: 11, processType: 'Washed', status: 'Hulled',
}
const saleRow: GreenBeanWithdrawalRecord = {
  id: 'w-sale', amountKg: 4, withdrawalType: 'Sale', date: '2026-09-20', purpose: 'Sale',
  customerName: 'Cafe Doi', salePrice: 300, currency: 'THB', totalAmount: 1200,
}
const voidedSample: GreenBeanWithdrawalRecord = {
  id: 'w-sample', amountKg: 1, withdrawalType: 'Sample', date: '2026-09-19', purpose: 'Sample',
  voidedAt: '2026-10-01T00:00:00.000Z', voidReason: 'Never sent',
}
const lot = (createdById = 'processor', history = [saleRow, voidedSample]): GreenBeanLot => ({
  id: 'gbl-h', displayId: 'GBL-2026-50', sourceType: GreenBeanSourceType.Internal, createdById,
  parchmentLotId: 'pl-w', grade: 'Grade A', initialWeightKg: 10, currentWeightKg: 6,
  availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: history,
})

function Harness({ initialLot = lot(), roles = [UserRole.Processor], onData }: {
  initialLot?: GreenBeanLot
  roles?: UserRole[]
  onData?: (data: AppData) => void
}) {
  const [data, setData] = useState<AppData>({
    ...INITIAL_APP_DATA, harvestLots: [], parchmentLots: [washed], greenBeanLots: [initialLot],
  })
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ParchmentTab currentUser={{ id: 'processor', name: 'Processor', roles }} />
      </ToastProvider>
    </DataContext.Provider>
  )
}

const rows = () => screen.getAllByTestId('source-withdrawal-row')
const openSourceHistory = () => fireEvent.click(screen.getByLabelText('View source history'))

describe('Source History Void and Edit (D7)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers Edit and Void on the Sale, and shows the voided row struck through with no actions', () => {
    render(<Harness />)
    openSourceHistory()
    const [sale, sample] = rows()
    expect(within(sale).getByRole('button', { name: 'Edit sale' })).toBeInTheDocument()
    expect(within(sale).getByRole('button', { name: 'Void withdrawal' })).toBeInTheDocument()
    expect(within(sample).getByText('Voided')).toBeInTheDocument()
    expect(within(sample).getByText('1 kg')).toHaveClass('line-through')
    expect(within(sample).getByTestId('voided-note')).toHaveTextContent('Never sent')
    expect(within(sample).queryByRole('button', { name: 'Void withdrawal' })).not.toBeInTheDocument()
    expect(within(sample).queryByRole('button', { name: 'Edit sale' })).not.toBeInTheDocument()
  })

  it("an Admin gets them on another processor's lot", () => {
    render(<Harness initialLot={lot('other')} roles={[UserRole.Admin]} />)
    openSourceHistory()
    expect(within(rows()[0]).getByRole('button', { name: 'Void withdrawal' })).toBeInTheDocument()
  })

  it('voids a withdrawal and shows the kg back and the row voided without a reload', async () => {
    const voidedSale = { ...saleRow, voidedAt: '2026-10-04T00:00:00.000Z', voidReason: 'Wrong lot' }
    vi.mocked(voidGreenBeanWithdrawal).mockResolvedValue({
      greenBeanLot: { ...lot(), currentWeightKg: 10, withdrawalHistory: [voidedSale, voidedSample] },
      withdrawal: voidedSale,
      roasterInventoryItem: null,
    })
    const onData = vi.fn()
    render(<Harness onData={onData} />)
    openSourceHistory()
    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Void withdrawal' }))
    const popup = screen.getByRole('dialog', { name: 'Void withdrawal' })
    expect(within(popup).getByTestId('void-withdrawal-effects')).toHaveTextContent(
      '4.00 kg go back to green bean lot GBL-2026-50.',
    )
    fireEvent.change(within(popup).getByLabelText(/Reason/), { target: { value: 'Wrong lot' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Void withdrawal' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Void withdrawal' })).not.toBeInTheDocument())
    expect(voidGreenBeanWithdrawal).toHaveBeenCalledWith('gbl-h', 'w-sale', 'Wrong lot')
    expect(within(rows()[0]).getByText('Voided')).toBeInTheDocument()
    expect(within(rows()[0]).getByTestId('voided-note')).toHaveTextContent('Wrong lot')
    // The popup's total follows the lot's kg, now 10.
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('10')
    // onData runs in an effect, after the render the assertions above saw.
    await waitFor(() =>
      expect((onData.mock.calls.at(-1)![0] as AppData).greenBeanLots[0].currentWeightKg).toBe(10))
  })

  it("edits a Sale's invoice number", async () => {
    vi.mocked(updateGreenBeanWithdrawal).mockResolvedValue({ ...saleRow, invoiceNumber: 'INV-77' })
    const onData = vi.fn()
    render(<Harness onData={onData} />)
    openSourceHistory()
    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Edit sale' }))
    const popup = screen.getByRole('dialog', { name: 'Edit sale' })
    fireEvent.change(within(popup).getByLabelText('Invoice number'), { target: { value: 'INV-77' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit sale' })).not.toBeInTheDocument())
    expect(updateGreenBeanWithdrawal).toHaveBeenCalledWith('gbl-h', 'w-sale', { invoiceNumber: 'INV-77' })
    await waitFor(() =>
      expect((onData.mock.calls.at(-1)![0] as AppData).greenBeanLots[0].withdrawalHistory?.[0].invoiceNumber).toBe('INV-77'))
  })
})
