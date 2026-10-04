import React, { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import ToastContainer from '../common/ToastContainer'
import { GreenBeanSourceType, ParchmentSourceType, ProcessingBatchStatus, UserRole } from '../../types'
import type {
  AppData,
  GreenBeanLot,
  GreenBeanWithdrawalRecord,
  ParchmentLot,
  ParchmentWithdrawalRecord,
  ProcessingBatch,
} from '../../types'
import { ApiError } from '../../services/apiError'
import {
  updateGreenBeanWithdrawal,
  voidGreenBeanWithdrawal,
} from '../../services/lots/greenBeanLotService'
import {
  getParchmentWithdrawals,
  voidParchmentWithdrawal,
} from '../../services/lots/parchmentLotService'
import ProcessorWorkbench from './ProcessorWorkbench'

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  voidGreenBeanWithdrawal: vi.fn(),
  updateGreenBeanWithdrawal: vi.fn(),
}))

vi.mock('../../services/lots/parchmentLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/parchmentLotService')>(),
  getParchmentWithdrawals: vi.fn(),
  voidParchmentWithdrawal: vi.fn(),
}))

// D7 on the Workbench: the withdrawal history popups give the lot's owner
// (and Admin) Void on every row and Edit on a Sale. A voided row stays,
// struck through with its reason, and no longer counts in the totals.

const pushRow: GreenBeanWithdrawalRecord = {
  id: 'w-push', amountKg: 10, withdrawalType: 'Roasting Stock', date: '2026-09-20', targetRoasterId: 'r-1',
  purpose: 'Roasting Stock',
}
const saleRow: GreenBeanWithdrawalRecord = {
  id: 'w-sale', amountKg: 5, withdrawalType: 'Sale', date: '2026-09-18', purpose: 'Sale',
  customerName: 'Cafe Doi', salePrice: 400, currency: 'THB', totalAmount: 2000,
}

const green = (id: string, createdById: string, history: GreenBeanWithdrawalRecord[], extra: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
  id, displayId: id.toUpperCase(), sourceType: GreenBeanSourceType.Internal, createdById,
  grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 35, availabilityStatus: 'Available',
  cuppingScores: [], withdrawalHistory: history, ...extra,
})

function Harness({ initial, roles = [UserRole.Processor], onData, refreshData = async () => {} }: {
  initial: Partial<AppData>
  roles?: UserRole[]
  onData?: (data: AppData) => void
  refreshData?: () => Promise<void>
}) {
  const [data, setData] = useState<AppData>({
    ...INITIAL_APP_DATA,
    users: [{ id: 'r-1', name: 'Doi Roasters', roles: [UserRole.Roaster] }],
    ...initial,
  })
  useEffect(() => { onData?.(data) }, [data, onData])
  return (
    <DataContext.Provider value={{ data, setData, refreshData, isEditing: false, setIsEditing: () => {} }}>
      <ToastProvider>
        <ProcessorWorkbench currentUser={{ id: 'processor', name: 'Processor', roles }} />
        <ToastContainer />
      </ToastProvider>
    </DataContext.Provider>
  )
}

const slow = { timeout: 5000 }
const historyModal = () =>
  screen.getByText('Withdrawal History', { selector: 'h2' }).closest('.rounded-2xl') as HTMLElement
const historyRows = () => within(historyModal()).getAllByTestId('withdrawal-history-row')
const openGreenHistory = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
  fireEvent.click(screen.getByRole('button', { name: 'View Withdrawal History' }))
}

describe('Workbench withdrawal Void and Edit (D7)', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  it("gives the lot's owner Void on every row and Edit on the Sale", () => {
    render(<Harness initial={{ greenBeanLots: [green('gbl-mine', 'processor', [pushRow, saleRow])] }} />)
    openGreenHistory()
    const [push, sale] = historyRows()
    expect(within(push).getByRole('button', { name: 'Void withdrawal' })).toBeInTheDocument()
    expect(within(push).queryByRole('button', { name: 'Edit sale' })).not.toBeInTheDocument()
    expect(within(sale).getByRole('button', { name: 'Void withdrawal' })).toBeInTheDocument()
    expect(within(sale).getByRole('button', { name: 'Edit sale' })).toBeInTheDocument()
    expect(within(sale).getByRole('button', { name: 'Invoice' })).toBeInTheDocument()
  })

  it("gives no Void or Edit on another processor's lot, but an Admin gets them", () => {
    const theirs = green('gbl-theirs', 'other', [pushRow, saleRow])
    const { unmount } = render(<Harness initial={{ greenBeanLots: [theirs] }} />)
    openGreenHistory()
    expect(within(historyModal()).queryByRole('button', { name: 'Void withdrawal' })).not.toBeInTheDocument()
    expect(within(historyModal()).queryByRole('button', { name: 'Edit sale' })).not.toBeInTheDocument()
    unmount()

    render(<Harness initial={{ greenBeanLots: [theirs] }} roles={[UserRole.Admin]} />)
    openGreenHistory()
    expect(within(historyModal()).getAllByRole('button', { name: 'Void withdrawal' })).toHaveLength(2)
    expect(within(historyModal()).getAllByRole('button', { name: 'Edit sale' })).toHaveLength(1)
  })

  it('shows a voided row struck through with its reason, and leaves it out of the totals', () => {
    const voidedSale = {
      ...saleRow, voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'processor', voidReason: 'Customer cancelled',
    }
    render(<Harness initial={{
      greenBeanLots: [green('gbl-mine', 'processor', [pushRow, voidedSale])],
      users: [{ id: 'processor', name: 'Proc One', roles: [UserRole.Processor] }],
    }} />)
    openGreenHistory()
    const modal = historyModal()
    // 10 kg pushed counts; the 5 kg voided sale does not.
    expect(within(modal).getByText('Total').nextElementSibling).toHaveTextContent(/^10\.00\s*kg$/)
    expect(within(modal).getByText('Withdrawals').nextElementSibling).toHaveTextContent(/^1$/)
    expect(within(modal).getByText('+1 voided')).toBeInTheDocument()

    const voided = historyRows()[1]
    expect(within(voided).getByText('Voided')).toBeInTheDocument()
    expect(within(voided).getByTestId('voided-note')).toHaveTextContent('by Proc One: Customer cancelled')
    expect(within(voided).getByText('5.00 kg')).toHaveClass('line-through')
    // A voided sale offers no invoice, and cannot be voided or edited again.
    expect(within(voided).queryByRole('button', { name: 'Invoice' })).not.toBeInTheDocument()
    expect(within(voided).queryByRole('button', { name: 'Void withdrawal' })).not.toBeInTheDocument()
    expect(within(voided).queryByRole('button', { name: 'Edit sale' })).not.toBeInTheDocument()
  })

  it('voids a Roasting Stock push: kg back on the lot and off the roaster stock, row marked in place', async () => {
    const voidedPush = { ...pushRow, voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'processor', voidReason: 'Wrong roaster' }
    vi.mocked(voidGreenBeanWithdrawal).mockResolvedValue({
      greenBeanLot: green('gbl-mine', 'processor', [voidedPush, saleRow], { currentWeightKg: 45 }),
      withdrawal: voidedPush,
      roasterInventoryItem: { id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-mine', claimedWeightKg: 0, remainingWeightKg: 0 },
    })
    const onData = vi.fn()
    render(<Harness
      initial={{
        greenBeanLots: [green('gbl-mine', 'processor', [pushRow, saleRow])],
        roasterInventory: [{ id: 'inv-1', roasterId: 'r-1', greenBeanLotId: 'gbl-mine', claimedWeightKg: 10, remainingWeightKg: 10 }],
      }}
      onData={onData}
    />)
    openGreenHistory()
    fireEvent.click(within(historyRows()[0]).getByRole('button', { name: 'Void withdrawal' }))

    const popup = screen.getByRole('dialog', { name: 'Void withdrawal' })
    expect(within(popup).getByTestId('void-withdrawal-effects')).toHaveTextContent(
      '10.00 kg go back to green bean lot GBL-MINE.',
    )
    expect(within(popup).getByTestId('void-withdrawal-effects')).toHaveTextContent(
      'The same 10.00 kg are taken back off the stock of Doi Roasters.',
    )
    fireEvent.change(within(popup).getByLabelText(/Reason/), { target: { value: 'Wrong roaster' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Void withdrawal' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Void withdrawal' })).not.toBeInTheDocument(), slow)
    expect(voidGreenBeanWithdrawal).toHaveBeenCalledWith('gbl-mine', 'w-push', 'Wrong roaster')
    // The history popup updates in place: the row is voided, the total drops.
    const [push] = historyRows()
    expect(within(push).getByText('Voided')).toBeInTheDocument()
    expect(within(push).getByTestId('voided-note')).toHaveTextContent('Wrong roaster')
    expect(within(historyModal()).getByText('Total').nextElementSibling).toHaveTextContent(/^5\.00\s*kg$/)
    expect(await screen.findByText(
      'Withdrawal voided: 10.00 kg are back on GBL-MINE and off the stock of Doi Roasters.',
    )).toBeInTheDocument()
    // onData runs in an effect, after the render the assertions above saw.
    await waitFor(() => {
      const data = onData.mock.calls.at(-1)![0] as AppData
      expect(data.greenBeanLots[0].currentWeightKg).toBe(45)
      expect(data.roasterInventory[0]).toMatchObject({ claimedWeightKg: 0, remainingWeightKg: 0 })
    })
  })

  it('reloads the page when the withdrawal was already voided elsewhere', async () => {
    vi.mocked(voidGreenBeanWithdrawal).mockRejectedValue(new ApiError('This withdrawal is already void.', 409))
    const refreshData = vi.fn(async () => {})
    render(<Harness initial={{ greenBeanLots: [green('gbl-mine', 'processor', [pushRow])] }} refreshData={refreshData} />)
    openGreenHistory()
    fireEvent.click(within(historyRows()[0]).getByRole('button', { name: 'Void withdrawal' }))
    const popup = screen.getByRole('dialog', { name: 'Void withdrawal' })
    fireEvent.click(within(popup).getByRole('button', { name: 'Void withdrawal' }))
    expect(await within(popup).findByRole('alert')).toHaveTextContent('This withdrawal is already void.')
    await waitFor(() => expect(refreshData).toHaveBeenCalledTimes(1))
  })

  it("edits a Sale's price and shows it in the history", async () => {
    vi.mocked(updateGreenBeanWithdrawal).mockResolvedValue({ ...saleRow, salePrice: 410, totalAmount: 2050 })
    render(<Harness initial={{ greenBeanLots: [green('gbl-mine', 'processor', [saleRow])] }} />)
    openGreenHistory()
    fireEvent.click(within(historyRows()[0]).getByRole('button', { name: 'Edit sale' }))
    const popup = screen.getByRole('dialog', { name: 'Edit sale' })
    fireEvent.change(within(popup).getByLabelText('Price per kg'), { target: { value: '410' } })
    fireEvent.click(within(popup).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit sale' })).not.toBeInTheDocument(), slow)
    expect(updateGreenBeanWithdrawal).toHaveBeenCalledWith('gbl-mine', 'w-sale', { salePrice: 410 })
    expect(within(historyRows()[0]).getByText(/410\.00 THB\/kg/)).toBeInTheDocument()
    expect(within(historyRows()[0]).getByText(/2050\.00 THB/)).toBeInTheDocument()
  })
})

describe('Workbench parchment withdrawals (D7)', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  const batch = (createdById: string): ProcessingBatch => ({
    id: 'pb-1', displayId: 'PB-1', harvestLotId: 'hl-1', createdById, status: ProcessingBatchStatus.Completed,
    processType: 'Washed', parchmentWeightKg: 100, moistureContent: 11,
    dryingStartDate: '2026-09-01', dryingEndDate: '2026-09-10', baggingDate: '2026-09-10',
  })
  const parchment: ParchmentLot = {
    id: 'pl-1', displayId: 'PL-HULLED', processingBatchId: 'pb-1', harvestLotId: 'hl-1',
    sourceType: ParchmentSourceType.Internal, initialWeightKg: 100, currentWeightKg: 0,
    moistureContent: 11, processType: 'Washed', status: 'Hulled',
  }
  const hull: ParchmentWithdrawalRecord = {
    id: 'pw-1', amountKg: 100, withdrawalType: 'HullAndGrade', date: '2026-09-20T00:00:00.000Z', purpose: 'Hull and grade',
  }
  const made = green('gbl-made', 'processor', [], {
    parchmentLotId: 'pl-1', parchmentWithdrawalId: 'pw-1', initialWeightKg: 80, currentWeightKg: 80,
  })
  const splitModal = () =>
    screen.getByText('Green Bean Split History', { selector: 'h2' }).closest('.rounded-2xl') as HTMLElement
  const openSplitHistory = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))
    fireEvent.click(screen.getByTitle('View Green Bean Lots'))
  }

  it('loads the lot withdrawals and voids a Hull & Grade, removing the lots it made', async () => {
    vi.mocked(getParchmentWithdrawals).mockResolvedValue([hull])
    const voidedHull = { ...hull, voidedAt: '2026-10-04T08:00:00.000Z', voidedById: 'processor', voidReason: 'Wrong split' }
    vi.mocked(voidParchmentWithdrawal).mockResolvedValue({
      parchmentLot: { ...parchment, currentWeightKg: 100, status: 'AwaitingHulling', withdrawalHistory: [voidedHull] },
      withdrawal: voidedHull,
      removedGreenBeanLots: [{ id: 'gbl-made', displayId: 'GBL-MADE', grade: 'Grade A', initialWeightKg: 80 }],
    })
    const onData = vi.fn()
    render(<Harness
      initial={{ processingBatches: [batch('processor')], parchmentLots: [parchment], greenBeanLots: [made] }}
      onData={onData}
    />)
    openSplitHistory()

    const row = await within(splitModal()).findByTestId('parchment-withdrawal-row', {}, slow)
    expect(getParchmentWithdrawals).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl-1' }))
    expect(row).toHaveTextContent('Hull & Grade')
    expect(row).toHaveTextContent('Made 1 green bean lot')
    expect(row).toHaveTextContent('100.00 kg')
    fireEvent.click(within(row).getByRole('button', { name: 'Void withdrawal' }))

    const popup = screen.getByRole('dialog', { name: 'Void withdrawal' })
    expect(within(popup).getByTestId('void-withdrawal-effects')).toHaveTextContent(
      'The green bean lots this Hull & Grade made are deleted: GBL-MADE (Grade A, 80.00 kg).',
    )
    fireEvent.click(within(popup).getByRole('button', { name: 'Void withdrawal' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Void withdrawal' })).not.toBeInTheDocument(), slow)
    expect(voidParchmentWithdrawal).toHaveBeenCalledWith('pl-1', 'pw-1', '')
    const modal = splitModal()
    expect(within(modal).getByText('No green bean lots found for this parchment lot')).toBeInTheDocument()
    const voidedRow = within(modal).getByTestId('parchment-withdrawal-row')
    expect(within(voidedRow).getByText('Voided')).toBeInTheDocument()
    expect(within(voidedRow).queryByRole('button', { name: 'Void withdrawal' })).not.toBeInTheDocument()
    await waitFor(() => {
      const data = onData.mock.calls.at(-1)![0] as AppData
      expect(data.greenBeanLots).toEqual([])
      expect(data.parchmentLots[0]).toMatchObject({ currentWeightKg: 100, status: 'AwaitingHulling' })
    })
  })

  it("lists another processor's parchment withdrawals without Void", async () => {
    vi.mocked(getParchmentWithdrawals).mockResolvedValue([hull])
    render(<Harness initial={{ processingBatches: [batch('other')], parchmentLots: [parchment], greenBeanLots: [{ ...made, createdById: 'other' }] }} />)
    openSplitHistory()
    const row = await within(splitModal()).findByTestId('parchment-withdrawal-row', {}, slow)
    expect(within(row).queryByRole('button', { name: 'Void withdrawal' })).not.toBeInTheDocument()
  })

  it('says so when the withdrawals cannot be loaded, and tries again on request', async () => {
    vi.mocked(getParchmentWithdrawals).mockResolvedValueOnce(null).mockResolvedValueOnce([hull])
    render(<Harness initial={{ processingBatches: [batch('processor')], parchmentLots: [parchment], greenBeanLots: [made] }} />)
    openSplitHistory()
    expect(await within(splitModal()).findByText(/Could not load this lot's withdrawals\./, {}, slow)).toBeInTheDocument()
    fireEvent.click(within(splitModal()).getByRole('button', { name: 'Try again' }))
    expect(await within(splitModal()).findByTestId('parchment-withdrawal-row', {}, slow)).toHaveTextContent('Hull & Grade')
    expect(getParchmentWithdrawals).toHaveBeenCalledTimes(2)
  })
})
