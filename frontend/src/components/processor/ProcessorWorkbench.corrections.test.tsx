import React, { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { ToastProvider } from '../../contexts/ToastContext'
import ToastContainer from '../common/ToastContainer'
import { GreenBeanSourceType, ParchmentSourceType, ProcessingBatchStatus, UserRole } from '../../types'
import type { AppData, GreenBeanLot, HarvestLot, ParchmentLot, ProcessingBatch } from '../../types'
import { ApiError } from '../../services/apiError'
import { deleteProcessingBatch, updateProcessingBatch } from '../../services/processing/processingBatchService'
import { deleteParchmentLot, getParchmentWithdrawals, updateParchmentLot } from '../../services/lots/parchmentLotService'
import { deleteGreenBeanLot, updateGreenBeanLotDetails } from '../../services/lots/greenBeanLotService'
import ProcessorWorkbench from './ProcessorWorkbench'

vi.mock('../../services/processing/processingBatchService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/processing/processingBatchService')>(),
  updateProcessingBatch: vi.fn(),
  deleteProcessingBatch: vi.fn(),
}))

vi.mock('../../services/lots/parchmentLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/parchmentLotService')>(),
  updateParchmentLot: vi.fn(),
  deleteParchmentLot: vi.fn(),
  getParchmentWithdrawals: vi.fn(),
}))

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  updateGreenBeanLotDetails: vi.fn(),
  deleteGreenBeanLot: vi.fn(),
}))

// F24: batches, parchment lots and green-bean lots get Edit and Delete on the
// workbench, for their owner or an Admin only. A batch's only parchment lot
// is edited and deleted as the batch; a delete removes only that record and
// the backend refuses (409, with the counts) while anything was drawn from it.

const cherry = (id: string, displayId: string): HarvestLot => ({
  id, displayId, weightKg: 400, status: 'Complete', farmerName: 'Somchai',
  cherryVariety: 'Catimor', farmPlotLocation: '', harvestDate: '2026-09-15',
})

const batch = (id: string, harvestLotId: string, createdById: string): ProcessingBatch => ({
  id, displayId: id.toUpperCase(), harvestLotId, createdById, status: ProcessingBatchStatus.Completed,
  processType: 'Washed', parchmentWeightKg: 100, moistureContent: 11,
  dryingStartDate: '2026-09-01', dryingEndDate: '2026-09-20', baggingDate: '2026-09-20',
})

const parchment = (id: string, displayId: string, batchId: string | undefined, current = 60): ParchmentLot => ({
  id, displayId, processingBatchId: batchId, harvestLotId: batchId ? `hl-${batchId}` : undefined,
  sourceType: batchId ? ParchmentSourceType.Internal : ParchmentSourceType.External,
  initialWeightKg: 100, currentWeightKg: current, moistureContent: 11, processType: 'Washed',
  status: 'AwaitingHulling',
})

const green = (id: string, displayId: string, createdById: string, parchmentLotId?: string): GreenBeanLot => ({
  id, displayId, sourceType: GreenBeanSourceType.Internal, parchmentLotId, createdById,
  parchmentProcessType: 'Washed', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 30,
  availabilityStatus: 'Available', cuppingScores: [],
})

// Mine: a batch whose parchment was drawn from (40 kg out) with a green-bean
// lot, and an untouched batch. Theirs: another processor's batch and lot.
const mineCherry = cherry('hl-pb-mine', 'HL-2026-1')
const freshCherry = cherry('hl-pb-fresh', 'HL-2026-2')
const theirCherry = cherry('hl-pb-theirs', 'HL-2026-3')
const mineBatch = batch('pb-mine', 'hl-pb-mine', 'processor')
const freshBatch = batch('pb-fresh', 'hl-pb-fresh', 'processor')
const theirBatch = batch('pb-theirs', 'hl-pb-theirs', 'other')
const mineParchment = parchment('pl-mine', 'PCH-MINE', 'pb-mine')
const freshParchment = parchment('pl-fresh', 'PCH-FRESH', 'pb-fresh', 100)
const theirParchment = parchment('pl-theirs', 'PCH-THEIRS', 'pb-theirs')
const externalParchment = parchment('pl-ext', 'PCH-EXT', undefined, 80)
// Made by a Hull & Grade of PCH-MINE (an Internal lot of a parchment lot).
const mineGreen = green('gbl-mine', 'GBL-MINE', 'processor', 'pl-mine')
const theirGreen = green('gbl-theirs', 'GBL-THEIRS', 'other', 'pl-theirs')
// Bought in: no Hull & Grade behind it.
const mineExternalGreen: GreenBeanLot = {
  ...green('gbl-ext', 'GBL-EXT', 'processor'),
  sourceType: GreenBeanSourceType.External,
  externalSource: {
    originName: 'Doi Chang Coop', variety: 'Typica', processType: 'Washed',
    purchaseDate: '2026-09-01', pricePerKg: 300, currency: 'THB',
  },
}

const initialData = (): AppData => ({
  ...INITIAL_APP_DATA,
  harvestLots: [mineCherry, freshCherry, theirCherry],
  processingBatches: [mineBatch, freshBatch, theirBatch],
  parchmentLots: [mineParchment, freshParchment, theirParchment, externalParchment],
  greenBeanLots: [mineGreen, theirGreen, mineExternalGreen],
})

function Harness({ roles = [UserRole.Processor], onData, refreshData = async () => {}, start = initialData }: {
  roles?: UserRole[]
  onData?: (data: AppData) => void
  refreshData?: () => Promise<void>
  start?: () => AppData
}) {
  const [data, setData] = useState(start)
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

const button = (name: string) => screen.queryByRole('button', { name })
// The whole workbench re-renders after each save; give it room under a
// busy parallel run.
const slow = { timeout: 5000 }
const toDataGrid = () => fireEvent.click(screen.getByRole('button', { name: 'Data Grid' }))

describe('Workbench edit and delete (F24)', { timeout: 20000 }, () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(getParchmentWithdrawals).mockResolvedValue([])
  })
  afterEach(() => confirmSpy.mockRestore())

  it.each(['Workflow', 'Data Grid'])('in %s a Processor gets Edit and Delete on their own records only', (view) => {
    render(<Harness />)
    if (view === 'Data Grid') toDataGrid()

    for (const id of ['PCH-MINE', 'PCH-FRESH']) {
      expect(button(`Edit parchment lot ${id}`)).toBeInTheDocument()
      expect(button(`Delete parchment lot ${id}`)).toBeInTheDocument()
    }
    expect(button('Edit green bean lot GBL-MINE')).toBeInTheDocument()
    expect(button('Delete green bean lot GBL-MINE')).toBeInTheDocument()
    // Another processor's batch and lot, and external parchment (Admin-only).
    for (const name of [
      'Edit parchment lot PCH-THEIRS', 'Delete parchment lot PCH-THEIRS',
      'Edit parchment lot PCH-EXT', 'Delete parchment lot PCH-EXT',
      'Edit green bean lot GBL-THEIRS', 'Delete green bean lot GBL-THEIRS',
    ]) {
      expect(button(name)).not.toBeInTheDocument()
    }
  })

  it.each(['Workflow', 'Data Grid'])('in %s an Admin gets Edit and Delete on every record', (view) => {
    render(<Harness roles={[UserRole.Admin]} />)
    if (view === 'Data Grid') toDataGrid()

    for (const id of ['PCH-MINE', 'PCH-FRESH', 'PCH-THEIRS', 'PCH-EXT']) {
      expect(button(`Edit parchment lot ${id}`)).toBeInTheDocument()
      expect(button(`Delete parchment lot ${id}`)).toBeInTheDocument()
    }
    for (const id of ['GBL-MINE', 'GBL-THEIRS']) {
      expect(button(`Edit green bean lot ${id}`)).toBeInTheDocument()
      expect(button(`Delete green bean lot ${id}`)).toBeInTheDocument()
    }
  })

  it('edits a batch\'s parchment as the batch and saves into the batch, its parchment and its green beans', async () => {
    vi.mocked(updateProcessingBatch).mockResolvedValue({
      processingBatch: { ...mineBatch, processType: 'Natural', parchmentWeightKg: 90 },
      parchmentLots: [{ ...mineParchment, initialWeightKg: 90, currentWeightKg: 50, processType: 'Natural' }],
    })
    let latest: AppData | undefined
    render(<Harness onData={(d) => { latest = d }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit parchment lot PCH-MINE' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit processing batch' })
    expect(within(dialog).getByText('PB-MINE')).toBeInTheDocument()
    expect(within(dialog).getByTestId('edit-batch-stock')).toHaveTextContent('40.00 kg already withdrawn or hulled')
    fireEvent.change(within(dialog).getByLabelText('Parchment output (kg)'), { target: { value: '90' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit processing batch' })).not.toBeInTheDocument(), slow)
    expect(updateProcessingBatch).toHaveBeenCalledWith('pb-mine', { parchmentWeightKg: 90 })
    expect(latest!.processingBatches.find((b) => b.id === 'pb-mine')).toMatchObject({ processType: 'Natural', parchmentWeightKg: 90 })
    expect(latest!.parchmentLots.find((p) => p.id === 'pl-mine')).toMatchObject({ initialWeightKg: 90, currentWeightKg: 50, processType: 'Natural' })
    expect(latest!.greenBeanLots.find((g) => g.id === 'gbl-mine')?.parchmentProcessType).toBe('Natural')
    expect(await screen.findByText('Processing batch PB-MINE updated.', {}, slow)).toBeInTheDocument()
  })

  it('edits external parchment in the parchment popup', async () => {
    vi.mocked(updateParchmentLot).mockResolvedValue({ ...externalParchment, initialWeightKg: 110, currentWeightKg: 90 })
    let latest: AppData | undefined
    render(<Harness roles={[UserRole.Admin]} onData={(d) => { latest = d }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit parchment lot PCH-EXT' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit parchment lot' })
    fireEvent.change(within(dialog).getByLabelText('Lot weight (kg)'), { target: { value: '110' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateParchmentLot).toHaveBeenCalledWith('pl-ext', { initialWeightKg: 110 }), slow)
    await waitFor(() => expect(latest!.parchmentLots.find((p) => p.id === 'pl-ext')).toMatchObject({ initialWeightKg: 110, currentWeightKg: 90 }), slow)
    expect(updateProcessingBatch).not.toHaveBeenCalled()
  })

  it('deletes a batch\'s untouched parchment as the batch only and hands its cherry lot back', async () => {
    vi.mocked(deleteProcessingBatch).mockResolvedValue({ harvestLotReleased: true, parchmentLotsDeleted: 1 })
    let latest: AppData | undefined
    render(<Harness onData={(d) => { latest = d }} />)
    expect(button('Record Process')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete parchment lot PCH-FRESH' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(
      /^Delete processing batch PB-FRESH and its parchment lot PCH-FRESH\? Cherry lot HL-2026-2 goes back to Cherry Lots/,
    ))
    await waitFor(() => expect(deleteProcessingBatch).toHaveBeenCalledWith('pb-fresh'), slow)
    // Only the batch: the old handler deleted its parchment and green beans first.
    expect(deleteParchmentLot).not.toHaveBeenCalled()
    expect(deleteGreenBeanLot).not.toHaveBeenCalled()
    await waitFor(() => expect(button('Edit parchment lot PCH-FRESH')).not.toBeInTheDocument(), slow)
    expect(latest!.processingBatches.map((b) => b.id)).not.toContain('pb-fresh')
    expect(latest!.harvestLots.find((h) => h.id === 'hl-pb-fresh')?.status).toBe('Ready for Processing')
    expect(screen.getByRole('button', { name: 'Record Process' })).toBeInTheDocument()
  })

  it('keeps everything when the backend refuses the delete with the counts', async () => {
    const refused = 'This batch\'s parchment already has 1 withdrawal and 1 green bean lot, so the batch was not deleted'
    vi.mocked(deleteProcessingBatch).mockRejectedValue(new ApiError(refused, 409, { error: refused }))
    let latest: AppData | undefined
    render(<Harness onData={(d) => { latest = d }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete parchment lot PCH-MINE' }))

    expect(await screen.findByText(refused, {}, slow)).toBeInTheDocument()
    expect(latest!.parchmentLots.map((p) => p.id)).toContain('pl-mine')
    expect(latest!.processingBatches.map((b) => b.id)).toContain('pb-mine')
    expect(button('Edit parchment lot PCH-MINE')).toBeInTheDocument()
  })

  it('sends nothing when the delete is not confirmed', () => {
    confirmSpy.mockReturnValue(false)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete parchment lot PCH-FRESH' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete green bean lot GBL-EXT' }))
    expect(deleteProcessingBatch).not.toHaveBeenCalled()
    expect(deleteGreenBeanLot).not.toHaveBeenCalled()
  })

  it('deletes external parchment as a lot', async () => {
    vi.mocked(deleteParchmentLot).mockResolvedValue(undefined)
    let latest: AppData | undefined
    render(<Harness roles={[UserRole.Admin]} onData={(d) => { latest = d }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete parchment lot PCH-EXT' }))

    await waitFor(() => expect(deleteParchmentLot).toHaveBeenCalledWith('pl-ext'), slow)
    expect(deleteProcessingBatch).not.toHaveBeenCalled()
    await waitFor(() => expect(latest!.parchmentLots.map((p) => p.id)).not.toContain('pl-ext'), slow)
  })

  it('corrects a green-bean lot\'s grade and weight from its card', async () => {
    vi.mocked(updateGreenBeanLotDetails).mockResolvedValue({ ...mineGreen, grade: 'Grade B', initialWeightKg: 45, currentWeightKg: 25 })
    let latest: AppData | undefined
    render(<Harness onData={(d) => { latest = d }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit green bean lot GBL-MINE' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit green bean lot' })
    expect(within(dialog).getByText('PCH-MINE')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Grade A/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Grade B' }))
    fireEvent.change(within(dialog).getByLabelText('Lot weight (kg)'), { target: { value: '45' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateGreenBeanLotDetails).toHaveBeenCalledWith('gbl-mine', { grade: 'Grade B', initialWeightKg: 45 }), slow)
    await waitFor(() => expect(latest!.greenBeanLots.find((g) => g.id === 'gbl-mine')).toMatchObject({
      grade: 'Grade B', initialWeightKg: 45, currentWeightKg: 25,
    }), slow)
    // The merge keeps what the PUT response does not carry.
    expect(latest!.greenBeanLots.find((g) => g.id === 'gbl-mine')?.parchmentProcessType).toBe('Washed')
  })

  it('deletes a green-bean lot after confirming, with its empty roaster stock row', async () => {
    vi.mocked(deleteGreenBeanLot).mockResolvedValue(undefined)
    let latest: AppData | undefined
    // A claim released to 0 leaves an empty row; the backend deletes it with the lot.
    const start = (): AppData => ({
      ...initialData(),
      roasterInventory: [
        { id: 'inv-ext', roasterId: 'roaster', greenBeanLotId: 'gbl-ext', claimedWeightKg: 0, remainingWeightKg: 0 },
        { id: 'inv-theirs', roasterId: 'roaster', greenBeanLotId: 'gbl-theirs', claimedWeightKg: 5, remainingWeightKg: 5 },
      ],
    })
    render(<Harness start={start} onData={(d) => { latest = d }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete green bean lot GBL-EXT' }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('GBL-EXT (Grade A)'))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('a withdrawal that is not void, roaster stock holding kg'))
    await waitFor(() => expect(deleteGreenBeanLot).toHaveBeenCalledWith('gbl-ext'), slow)
    await waitFor(() => expect(latest!.greenBeanLots.map((g) => g.id)).not.toContain('gbl-ext'), slow)
    expect(latest!.roasterInventory.map((inv) => inv.id)).toEqual(['inv-theirs'])
  })

  it('sends Delete on a lot a Hull & Grade made to its parchment lot\'s history, where the Void is', async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete green bean lot GBL-MINE' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(deleteGreenBeanLot).not.toHaveBeenCalled()
    expect(await screen.findByText(/^Green bean lot GBL-MINE was made by a Hull & Grade of parchment lot PCH-MINE\. To remove it, void that Hull & Grade/, {}, slow)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Green Bean Split History' })).toBeInTheDocument()
    expect(screen.getByText('Lot PCH-MINE')).toBeInTheDocument()
    await waitFor(() => expect(getParchmentWithdrawals).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl-mine' })), slow)
  })
})
