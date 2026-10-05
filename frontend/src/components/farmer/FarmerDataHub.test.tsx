import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { AppData, CropYear, Farm, HarvestLot, ProcessingBatch, User } from '../../types'
import { api } from '../../services/api'
import { ApiError } from '../../services/apiError'
import FarmerDataHub from './FarmerDataHub'

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const farmer: User = { id: 'u-farmer', name: 'Somchai', roles: [UserRole.Farmer] }
const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }

const lot = (overrides: Partial<HarvestLot>): HarvestLot => ({
  id: 'hl-1', displayId: 'HL-2026-1', farmId: 'farm-1', farmerName: 'Somchai',
  cherryVariety: 'Catimor', weightKg: 400, farmPlotLocation: 'Plot A',
  harvestDate: '2026-09-15', status: 'Ready for Processing', cropYearId: 'cy-2026',
  ...overrides,
})

const readyLot = lot({})
// Processed by status
const completeLot = lot({ id: 'hl-2', displayId: 'HL-2026-2', harvestDate: '2026-09-14', status: 'Complete' })
// Processed because a batch draws on it, though the list still says Ready
const batchedLot = lot({ id: 'hl-3', displayId: 'HL-2026-3', harvestDate: '2026-09-13' })
const batch = { id: 'pb-1', harvestLotId: 'hl-3' } as ProcessingBatch

const backendLot = (overrides: Record<string, unknown> = {}) => ({
  id: 'hl-1', displayId: 'HL-2026-1', farmId: 'farm-1', farmerName: 'Somchai',
  cherryVariety: 'Catimor', weightKg: 400, remainingWeightKg: 400,
  farmPlotLocation: 'Plot A', harvestDate: '2026-09-15T00:00:00.000Z',
  status: 'ReadyForProcessing', cropYearId: 'cy-2026',
  ...overrides,
})

const processedBody = {
  error: 'This lot has already been processed',
  dependents: { processingBatches: 2, parchmentLots: 1, greenBeanLots: 3, withdrawals: 4 },
}

const farms = [
  { id: 'farm-1', farmName: 'Doi Farm', location: 'Chiang Rai', farmerName: 'Somchai', ownerUserId: 'u-farmer' },
  { id: 'farm-2', farmName: 'Mae Farm', location: 'Nan', farmerName: 'Malee', ownerUserId: 'u-other' },
] as Farm[]
const cropYears = [
  { id: 'cy-2025', year: '2025/2026', startDate: '2025-10-01', endDate: '2026-09-30' },
  { id: 'cy-2026', year: '2026/2027', startDate: '2026-10-01', endDate: '2027-09-30' },
] as CropYear[]

const Harness: React.FC<{ user: User; refreshData?: () => Promise<void>; lots?: HarvestLot[] }> = ({
  user, refreshData = async () => {}, lots = [readyLot, completeLot, batchedLot],
}) => {
  const [data, setData] = useState<AppData>({
    ...INITIAL_APP_DATA,
    harvestLots: lots,
    processingBatches: [batch],
    farms,
    cropYears,
  })
  return (
    <MemoryRouter>
      <DataContext.Provider value={{ data, setData, refreshData, isEditing: false, setIsEditing: () => {} }}>
        <FarmerDataHub currentUser={user} />
      </DataContext.Provider>
    </MemoryRouter>
  )
}

const editDialog = () => screen.getByRole('dialog', { name: 'Edit Harvest Lot' })

describe('FarmerDataHub edit', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends only the fields that were changed, not the untouched farm or crop year', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ cherryVariety: 'Typica', weightKg: 385.5 }) })
    render(<Harness user={admin} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    fireEvent.change(within(editDialog()).getByLabelText('Cherry Variety'), { target: { value: ' Typica ' } })
    fireEvent.change(within(editDialog()).getByLabelText('Weight (kg)'), { target: { value: '385.5' } })
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Harvest Lot' })).not.toBeInTheDocument())
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual([
      '/harvest-lots/hl-1', { cherryVariety: 'Typica', weightKg: 385.5 },
    ])
    expect(screen.getByText('Typica')).toBeInTheDocument()
    expect(screen.getByText('385.5 kg')).toBeInTheDocument()
  })

  it('closes without saving when nothing was changed', () => {
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Save Changes' }))
    expect(api.put).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Edit Harvest Lot' })).not.toBeInTheDocument()
  })

  it('sends a status change in the backend form', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ status: 'Complete' }) })
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Ready for Processing' }))
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Complete' }))
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual(['/harvest-lots/hl-1', { status: 'Complete' }])
  })

  const statusButton = (dialog: HTMLElement) =>
    within(dialog).getAllByRole('button').find(b => /^(Ready for Processing|Complete)$/.test(b.textContent || ''))

  it('locks the weight and status of a lot a batch draws on for its farmer', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ id: 'hl-3', displayId: 'HL-2026-3', cherryVariety: 'Typica' }) })
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-3' }))

    const dialog = editDialog()
    expect(within(dialog).getByLabelText('Weight (kg)')).toBeDisabled()
    expect(statusButton(dialog)).toBeDisabled()
    expect(within(dialog).getByText('This lot has already been processed, so its weight and status are locked.')).toBeInTheDocument()

    // Other fields stay editable, and the weight or status never goes out.
    fireEvent.change(within(dialog).getByLabelText('Weight (kg)'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('Cherry Variety'), { target: { value: 'Typica' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual(['/harvest-lots/hl-3', { cherryVariety: 'Typica' }])
  })

  it('lets a farmer set a lot that only says Complete back to Ready', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ id: 'hl-2', displayId: 'HL-2026-2', status: 'ReadyForProcessing' }) })
    render(<Harness user={farmer} />)
    expect(screen.queryByRole('button', { name: 'Delete harvest lot HL-2026-2' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-2' }))

    const dialog = editDialog()
    expect(within(dialog).getByLabelText('Weight (kg)')).toBeDisabled()
    expect(within(dialog).getByText(/This lot is marked Complete, so its weight is locked/)).toBeInTheDocument()
    fireEvent.click(statusButton(dialog) as HTMLElement)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ready for Processing' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual(['/harvest-lots/hl-2', { status: 'ReadyForProcessing' }])
    // Back to Ready, the farmer may delete it again.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-2' })).toBeInTheDocument())
  })

  it('lets an Admin correct the weight of a processed lot, but not its status', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ id: 'hl-3', displayId: 'HL-2026-3', weightKg: 150 }) })
    render(<Harness user={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-3' }))

    const dialog = editDialog()
    expect(within(dialog).getByLabelText('Weight (kg)')).toBeEnabled()
    expect(statusButton(dialog)).toBeDisabled()
    expect(within(dialog).getByText(/As an Admin you can still correct its weight/)).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Weight (kg)'), { target: { value: '150' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual(['/harvest-lots/hl-3', { weightKg: 150 }])
  })

  it('lets an Admin change everything on a lot that only says Complete', () => {
    render(<Harness user={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-2' }))

    const dialog = editDialog()
    expect(within(dialog).getByLabelText('Weight (kg)')).toBeEnabled()
    expect(statusButton(dialog)).toBeEnabled()
    expect(within(dialog).queryByText(/locked|As an Admin/)).not.toBeInTheDocument()
  })

  it('moves a lot to another farm and clears its crop year, sending only those', async () => {
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ farmId: 'farm-2', cropYearId: null }) })
    render(<Harness user={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    const dialog = editDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Doi Farm • Chiang Rai' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mae Farm • Nan' }))
    expect(within(dialog).getByText('The lot will belong to the owner of this farm.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '2026/2027' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'No crop year' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual([
      '/harvest-lots/hl-1', { farmId: 'farm-2', cropYearId: null },
    ])
  })

  it('offers a farmer only their own farms', () => {
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Doi Farm • Chiang Rai' }))
    expect(within(editDialog()).getAllByRole('button', { name: 'Doi Farm • Chiang Rai' })).toHaveLength(2)
    expect(within(editDialog()).queryByRole('button', { name: 'Mae Farm • Nan' })).not.toBeInTheDocument()
  })

  it('lets an Admin put a lot that lost its farm back on one', async () => {
    // The old edit bug left this lot without a farm or crop year.
    const orphan = lot({ farmId: undefined, cropYearId: undefined })
    vi.mocked(api.put).mockResolvedValue({ harvestLot: backendLot({ farmId: 'farm-1', cropYearId: 'cy-2025' }) })
    render(<Harness user={admin} lots={[orphan]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    const dialog = editDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Not linked to a farm' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Doi Farm • Chiang Rai' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'No crop year' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '2025/2026' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0]).toStrictEqual([
      '/harvest-lots/hl-1', { farmId: 'farm-1', cropYearId: 'cy-2025' },
    ])
  })

  it("shows the backend's reason and keeps the form open when the save is refused", async () => {
    const message = 'This lot has already been processed, so its weight and status are locked'
    vi.mocked(api.put).mockRejectedValue(new ApiError(message, 409, { error: message }))
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    fireEvent.change(within(editDialog()).getByLabelText('Weight (kg)'), { target: { value: '390' } })
    fireEvent.click(within(editDialog()).getByRole('button', { name: 'Save Changes' }))

    expect(await within(editDialog()).findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByText('HL-2026-1', { selector: 'td' }).closest('tr')).toHaveTextContent('400 kg')
  })

  it('refuses a blanked text field or a weight of 0 before saving', () => {
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-1' }))
    const form = within(editDialog()).getByRole('button', { name: 'Save Changes' }).closest('form') as HTMLFormElement

    fireEvent.change(within(editDialog()).getByLabelText('Farmer Name'), { target: { value: '   ' } })
    fireEvent.submit(form)
    expect(within(editDialog()).getByRole('alert')).toHaveTextContent('Farmer name cannot be blank.')

    fireEvent.change(within(editDialog()).getByLabelText('Farmer Name'), { target: { value: 'Somchai' } })
    fireEvent.change(within(editDialog()).getByLabelText('Weight (kg)'), { target: { value: '0' } })
    fireEvent.submit(form)
    expect(within(editDialog()).getByRole('alert')).toHaveTextContent('Weight must be a number greater than 0.')
    expect(api.put).not.toHaveBeenCalled()
  })
})

describe('FarmerDataHub delete', { timeout: 20000 }, () => {
  beforeEach(() => vi.clearAllMocks())

  it('hides Delete on processed lots for a farmer', () => {
    render(<Harness user={farmer} />)
    expect(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete harvest lot HL-2026-2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete harvest lot HL-2026-3' })).not.toBeInTheDocument()
    // Editing them stays possible.
    expect(screen.getByRole('button', { name: 'Edit harvest lot HL-2026-2' })).toBeInTheDocument()
  })

  it('shows Delete on processed lots for an Admin and a super admin', () => {
    const { unmount } = render(<Harness user={admin} />)
    expect(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-2' })).toBeInTheDocument()
    unmount()
    render(<Harness user={{ id: 'u-root', name: 'Root', roles: [UserRole.Farmer], isSuperAdmin: true }} />)
    expect(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-3' })).toBeInTheDocument()
  })

  it('deletes an unprocessed lot after a confirm in a popup, without cascade', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.mocked(api.delete).mockResolvedValue({})
    const refreshData = vi.fn(async () => {})
    render(<Harness user={farmer} refreshData={refreshData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-1' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete harvest lot' })
    expect(dialog).toHaveTextContent('Delete harvest lot HL-2026-1 from Somchai? This cannot be undone.')
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([['/harvest-lots/hl-1']])
    expect(screen.queryByText('HL-2026-1', { selector: 'td' })).not.toBeInTheDocument()
    expect(refreshData).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('cancels without deleting', () => {
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-1' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('shows why a delete was refused and keeps the lot', async () => {
    vi.mocked(api.delete).mockRejectedValue(new ApiError('Forbidden', 403, { error: 'Forbidden' }))
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-1' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have permission to delete harvest lot.")
    expect(screen.getByText('HL-2026-1', { selector: 'td' })).toBeInTheDocument()
  })

  it('never offers the cascade to a farmer whose lot was processed since the list loaded', async () => {
    vi.mocked(api.delete).mockRejectedValue(new ApiError(processedBody.error, 409, processedBody))
    render(<Harness user={farmer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-1' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This lot has already been processed, so only an Admin can delete it.')
    expect(screen.queryByRole('button', { name: 'Delete with everything linked' })).not.toBeInTheDocument()
    expect(vi.mocked(api.delete).mock.calls).toEqual([['/harvest-lots/hl-1']])
  })

  it('lets an Admin delete a processed lot with everything linked after seeing the counts', async () => {
    vi.mocked(api.delete)
      .mockRejectedValueOnce(new ApiError(processedBody.error, 409, processedBody))
      .mockResolvedValueOnce({})
    const refreshData = vi.fn(async () => {})
    render(<Harness user={admin} refreshData={refreshData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-2' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete harvest lot' })).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete a processed lot' })
    expect(dialog).toHaveTextContent('Harvest lot HL-2026-2 has already been processed.')
    const linked = within(within(dialog).getByRole('list', { name: 'Linked records' }))
    expect(linked.getByText(/2 processing batches/)).toBeInTheDocument()
    expect(linked.getByText(/1 parchment lot \(/)).toBeInTheDocument()
    expect(linked.getByText(/4 parchment withdrawals, including any sale records/)).toBeInTheDocument()
    expect(linked.getByText(/3 green bean lots made from it \(with their price history\)/)).toBeInTheDocument()
    expect(dialog).toHaveTextContent(
      'If any of those green bean lots is still in use (a withdrawal that is not void, roaster stock, a roast, a sale, an invoice or a cupping sample), nothing is deleted and you will see which lots to void or settle first.',
    )
    expect(dialog).not.toHaveTextContent('lose their link')
    // Nothing is gone yet.
    expect(screen.getByText('HL-2026-2', { selector: 'td' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete with everything linked' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([
      ['/harvest-lots/hl-2'],
      ['/harvest-lots/hl-2?cascade=1&expect=2,1,3,4'],
    ])
    expect(screen.queryByText('HL-2026-2', { selector: 'td' })).not.toBeInTheDocument()
    expect(refreshData).toHaveBeenCalledTimes(1)
  })

  it('shows the new counts instead of deleting when more was linked since the Admin looked', async () => {
    const changedBody = {
      error: 'What is linked to this lot has changed since you looked, so it was not deleted',
      dependents: { ...processedBody.dependents, withdrawals: 5 },
    }
    vi.mocked(api.delete)
      .mockRejectedValueOnce(new ApiError(processedBody.error, 409, processedBody))
      .mockRejectedValueOnce(new ApiError(changedBody.error, 409, changedBody))
      .mockResolvedValueOnce({})
    render(<Harness user={admin} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-2' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete with everything linked' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('What is linked to this lot changed since you looked, so nothing was deleted.')
    const dialog = screen.getByRole('dialog', { name: 'Delete a processed lot' })
    expect(within(dialog).getByText(/5 parchment withdrawals/)).toBeInTheDocument()
    expect(screen.getByText('HL-2026-2', { selector: 'td' })).toBeInTheDocument()

    // Confirming again sends the counts now shown.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete with everything linked' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([
      ['/harvest-lots/hl-2'],
      ['/harvest-lots/hl-2?cascade=1&expect=2,1,3,4'],
      ['/harvest-lots/hl-2?cascade=1&expect=2,1,3,5'],
    ])
  })

  it('shows which green bean lots to settle first when the cascade is refused over them', async () => {
    const inUse =
      'Green bean lots made from this lot are still in use, so nothing was deleted: GBL-2026-404 (AA) has 1 withdrawal. ' +
      'Void their withdrawals, or settle their stock, roasts, sales and cupping first, then delete again.'
    vi.mocked(api.delete)
      .mockRejectedValueOnce(new ApiError(processedBody.error, 409, processedBody))
      .mockRejectedValueOnce(new ApiError(inUse, 409, { error: inUse, greenBeanLotsInUse: [{ id: 'gbl-1', displayId: 'GBL-2026-404', grade: 'AA' }] }))
    const refreshData = vi.fn(async () => {})
    render(<Harness user={admin} refreshData={refreshData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-2' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete with everything linked' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(inUse)
    expect(screen.getByRole('dialog', { name: 'Delete a processed lot' })).toBeInTheDocument()
    expect(screen.getByText('HL-2026-2', { selector: 'td' })).toBeInTheDocument()
    expect(refreshData).not.toHaveBeenCalled()
  })

  it('does not mention green bean lots in use when none were made from the lot', async () => {
    const noGreen = { ...processedBody, dependents: { ...processedBody.dependents, greenBeanLots: 0 } }
    vi.mocked(api.delete).mockRejectedValueOnce(new ApiError(noGreen.error, 409, noGreen))
    render(<Harness user={admin} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-2' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete a processed lot' })
    expect(within(dialog).getByText(/0 green bean lots made from it/)).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('still in use')
  })

  it('keeps the lot and shows the error when the cascade delete fails', async () => {
    vi.mocked(api.delete)
      .mockRejectedValueOnce(new ApiError(processedBody.error, 409, processedBody))
      .mockRejectedValueOnce(new ApiError('Internal server error', 500, { error: 'Internal server error' }))
    const refreshData = vi.fn(async () => {})
    render(<Harness user={admin} refreshData={refreshData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-3' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete with everything linked' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error')
    expect(screen.getByRole('dialog', { name: 'Delete a processed lot' })).toBeInTheDocument()
    expect(screen.getByText('HL-2026-3', { selector: 'td' })).toBeInTheDocument()
    expect(refreshData).not.toHaveBeenCalled()
  })

  it('deletes an Admin\'s unprocessed lot straight away, without cascade', async () => {
    vi.mocked(api.delete).mockResolvedValue({})
    render(<Harness user={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete harvest lot HL-2026-1' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('HL-2026-1', { selector: 'td' })).not.toBeInTheDocument())
    expect(vi.mocked(api.delete).mock.calls).toEqual([['/harvest-lots/hl-1']])
  })
})
