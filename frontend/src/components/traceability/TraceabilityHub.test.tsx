import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { GreenBeanSourceType, UserRole } from '../../types'
import type { AppData, GreenBeanLot, User } from '../../types'
import { generatePublicTraceId } from '../../services/lots/greenBeanLotService'
import { toRoaId } from '../../utils/formatters'
import TraceabilityHub from './TraceabilityHub'

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  generatePublicTraceId: vi.fn(),
  // jsdom has no canvas: hand back the URL the QR would encode.
  generateQRDataUrl: vi.fn(async (url: string) => `data:image/png;qr,${encodeURIComponent(url)}`),
  generateQRSvg: vi.fn(async () => '<svg />'),
}))

// The sidebar and the route let a super admin in as an Admin whatever roles
// the account lists; the hub's own check sent them to the farmer dashboard.

let auth: { currentUser: User | null } = { currentUser: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const renderHub = (user: User, data: AppData = INITIAL_APP_DATA) => {
  auth = { currentUser: user }
  return render(
    <MemoryRouter initialEntries={['/traceability']}>
      <DataContext.Provider
        value={{ data, setData: () => {}, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}
      >
        <Routes>
          <Route path="/traceability" element={<TraceabilityHub />} />
          <Route path="/farmer-dashboard" element={<p>FARMER DASHBOARD</p>} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  )
}

describe('Traceability Hub access', () => {
  it.each([
    ['a super admin who only holds Farmer', { id: 'u-super', name: 'Owner', roles: [UserRole.Farmer], isSuperAdmin: true }],
    ['an Admin', { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }],
    ['a Processor', { id: 'u-proc', name: 'Processor', roles: [UserRole.Processor] }],
  ])('lets %s stay on the hub', (_label, user) => {
    renderHub(user as User)
    expect(screen.getByRole('heading', { name: 'Traceability Curation Hub' })).toBeInTheDocument()
    expect(screen.queryByText('FARMER DASHBOARD')).not.toBeInTheDocument()
  })

  it('still sends a Farmer to their dashboard', () => {
    renderHub({ id: 'u-farmer', name: 'Farmer', roles: [UserRole.Farmer] })
    expect(screen.getByText('FARMER DASHBOARD')).toBeInTheDocument()
  })
})

// Publishing a lot (generating its public id) and previewing it before it is
// public are for the lot's creator or an Admin: the backend refuses anyone
// else with a 403. Others see a lot's QR and story once it is published.
describe('Traceability Hub publish controls', () => {
  const lot = (id: string, displayId: string, createdById: string, publicTraceId?: string): GreenBeanLot => ({
    id, displayId, createdById, publicTraceId, sourceType: GreenBeanSourceType.Internal, grade: 'Grade A',
    initialWeightKg: 10, currentWeightKg: 10, availabilityStatus: 'Available',
    cuppingScores: [], withdrawalHistory: [],
  })
  const data: AppData = {
    ...INITIAL_APP_DATA,
    greenBeanLots: [
      lot('11111111-0000-4000-8000-000000000001', 'GBL-2026-1', 'u-proc'),
      lot('22222222-0000-4000-8000-000000000002', 'GBL-2026-2', 'u-proc', 'pub-mine'),
      lot('33333333-0000-4000-8000-000000000003', 'GBL-2026-3', 'u-other'),
      lot('44444444-0000-4000-8000-000000000004', 'GBL-2026-4', 'u-other', 'pub-theirs'),
    ],
  }
  const [mineDraft, minePublished, theirsDraft, theirsPublished] = data.greenBeanLots.map((g) => g.id)
  const processor: User = { id: 'u-proc', name: 'Processor', roles: [UserRole.Processor] }
  // The row of a lot, found by the full id the Lot ID cell carries as its title.
  const row = (id: string) => within(screen.getByTitle(id).closest('tr') as HTMLElement)
  const viewLink = (id: string) => row(id).queryByRole('link', { name: /View/ })

  beforeEach(() => vi.clearAllMocks())

  it('gives the lot\'s creator Generate and the preview on their unpublished lot', () => {
    renderHub(processor, data)

    expect(row(mineDraft).getByRole('button', { name: /Generate/ })).toBeInTheDocument()
    expect(viewLink(mineDraft)).toHaveAttribute('href', `/traceability/${mineDraft}`)
    expect(row(minePublished).getByRole('button', { name: /QR/ })).toBeInTheDocument()
    expect(viewLink(minePublished)).toHaveAttribute('href', '/trace/pub-mine')
  })

  it('gives another user\'s unpublished lot neither Generate nor the preview', () => {
    renderHub(processor, data)

    expect(row(theirsDraft).queryByRole('button')).not.toBeInTheDocument()
    expect(viewLink(theirsDraft)).not.toBeInTheDocument()
  })

  it('opens another user\'s published QR without generating or offering Regenerate', async () => {
    renderHub(processor, data)

    expect(viewLink(theirsPublished)).toHaveAttribute('href', '/trace/pub-theirs')
    fireEvent.click(row(theirsPublished).getByRole('button', { name: /QR/ }))

    const dialog = await screen.findByRole('dialog', { name: 'QR Code · GBL-2026-4' })
    expect(within(dialog).getByText(/#\/trace\/pub-theirs/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Regenerate Public ID/ })).not.toBeInTheDocument()
    expect(generatePublicTraceId).not.toHaveBeenCalled()
  })

  it('gives the creator the Regenerate action on their own published QR', async () => {
    renderHub(processor, data)

    fireEvent.click(row(minePublished).getByRole('button', { name: /QR/ }))

    const dialog = await screen.findByRole('dialog', { name: 'QR Code · GBL-2026-2' })
    expect(within(dialog).getByRole('button', { name: /Regenerate Public ID/ })).toBeInTheDocument()
  })

  it.each([
    ['an Admin', { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }],
    ['a super admin', { id: 'u-super', name: 'Owner', roles: [UserRole.Processor], isSuperAdmin: true }],
  ])('gives %s Generate and the preview on anyone\'s lot', (_label, user) => {
    renderHub(user as User, data)

    for (const id of [mineDraft, theirsDraft]) {
      expect(row(id).getByRole('button', { name: /Generate/ })).toBeInTheDocument()
      expect(viewLink(id)).toHaveAttribute('href', `/traceability/${id}`)
    }
  })
})

// A Processor+Roaster reads a shelf lot's parchment but not the other
// processor's batch behind it: the process comes from the parchment lot.
describe('Traceability Hub process column', () => {
  const lotId = '55555555-0000-4000-8000-000000000005'
  const data: AppData = {
    ...INITIAL_APP_DATA,
    greenBeanLots: [{
      id: lotId, createdById: 'u-other', parchmentLotId: 'pl-shelf', sourceType: GreenBeanSourceType.Internal,
      grade: 'Grade A', initialWeightKg: 10, currentWeightKg: 10, availabilityStatus: 'Available',
      cuppingScores: [], withdrawalHistory: [],
    }],
    parchmentLots: [{
      id: 'pl-shelf', processingBatchId: 'pb-other', sourceType: 'Internal', initialWeightKg: 20,
      currentWeightKg: 0, moistureContent: 11, processType: 'Honey', status: 'Hulled',
    } as AppData['parchmentLots'][number]],
    processingBatches: [],
  }
  const row = () => within(screen.getByTitle(lotId).closest('tr') as HTMLElement)

  it('shows the parchment lot\'s process when the batch is not in the data', () => {
    renderHub({ id: 'u-proc', name: 'Processor', roles: [UserRole.Processor, UserRole.Roaster] }, data)

    expect(row().getByText('Honey')).toBeInTheDocument()
  })

  it('prefers the batch\'s process when the batch is there', () => {
    renderHub({ id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }, {
      ...data,
      processingBatches: [{ id: 'pb-other', processType: 'Washed' } as AppData['processingBatches'][number]],
    })

    expect(row().getByText('Washed')).toBeInTheDocument()
  })
})

// The hub names a green bean lot by the lot number the Processor Workbench
// uses (GBL-2026-7), not the hash-style ROA id the roaster pages give their
// own stock rows.
describe('Traceability Hub lot ids', () => {
  const lotA = '77777777-0000-4000-8000-000000000007'
  const lotB = '12121212-0000-4000-8000-000000000012'
  const greenLot = (id: string, displayId: string): GreenBeanLot => ({
    id, displayId, createdById: 'u-admin', sourceType: GreenBeanSourceType.Internal, grade: 'Grade A',
    initialWeightKg: 10, currentWeightKg: 10, availabilityStatus: 'Available',
    cuppingScores: [], withdrawalHistory: [],
  })
  const data: AppData = {
    ...INITIAL_APP_DATA,
    greenBeanLots: [greenLot(lotA, 'GBL-2026-7'), greenLot(lotB, 'GBL-2026-12')],
  }
  const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }
  const search = (term: string) =>
    fireEvent.change(screen.getByPlaceholderText(/Search by Lot ID/), { target: { value: term } })

  it('lists each lot by its lot number', () => {
    renderHub(admin, data)

    expect(screen.getByTitle(lotA)).toHaveTextContent('GBL-2026-7')
    expect(screen.getByTitle(lotB)).toHaveTextContent('GBL-2026-12')
    expect(screen.queryByText(toRoaId(lotA))).not.toBeInTheDocument()
    expect(screen.queryByText(/^ROA-/)).not.toBeInTheDocument()
  })

  it('finds a lot by its lot number', () => {
    renderHub(admin, data)

    search('gbl-2026-7')

    expect(screen.getByTitle(lotA)).toBeInTheDocument()
    expect(screen.queryByTitle(lotB)).not.toBeInTheDocument()
  })

  // Invoices and the roaster's stock rows still name the lot ROA-xxxx, so
  // that id finds the row, but the hub itself never shows it.
  it('still finds a lot by its ROA id without showing it', () => {
    renderHub(admin, data)

    search(toRoaId(lotA))

    expect(screen.getByTitle(lotA)).toHaveTextContent('GBL-2026-7')
    expect(screen.queryByTitle(lotB)).not.toBeInTheDocument()
    expect(screen.queryByText(/ROA-/)).not.toBeInTheDocument()
  })

  it('titles the QR popup with the lot number', async () => {
    vi.mocked(generatePublicTraceId).mockResolvedValue({
      publicTraceId: 'pub-7', publicUrl: '/trace/pub-7', greenBeanLot: { id: lotA, publicTraceId: 'pub-7', qrGeneratedAt: '2026-10-05T00:00:00Z' },
    })
    renderHub(admin, data)

    fireEvent.click(within(screen.getByTitle(lotA).closest('tr') as HTMLElement).getByRole('button', { name: /Generate/ }))

    expect(await screen.findByRole('dialog', { name: 'QR Code · GBL-2026-7' })).toBeInTheDocument()
  })
})

// A lot whose process is not known shows "Unknown", and the process filter
// offers "Unknown" (last) only when some row needs it.
describe('Traceability Hub unknown process', () => {
  const known = '88888888-0000-4000-8000-000000000008'
  const unknown = '99999999-0000-4000-8000-000000000009'
  const external = 'aaaaaaaa-0000-4000-8000-00000000000a'
  const greenLot = (id: string, displayId: string, extra: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
    id, displayId, createdById: 'u-admin', sourceType: GreenBeanSourceType.Internal, grade: 'Grade A',
    initialWeightKg: 10, currentWeightKg: 10, availabilityStatus: 'Available',
    cuppingScores: [], withdrawalHistory: [], ...extra,
  })
  const withProcess = greenLot(known, 'GBL-2026-8', { parchmentProcessType: 'Washed' })
  const admin: User = { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }
  const row = (id: string) => within(screen.getByTitle(id).closest('tr') as HTMLElement)
  const processOptions = () => {
    const filter = screen.getByText('Process', { selector: 'label' }).parentElement as HTMLElement
    fireEvent.click(within(filter).getByRole('button'))
    return within(filter).getAllByRole('button').slice(1).map((b) => b.textContent)
  }

  it('shows Unknown for a lot without a process and offers it last in the filter', () => {
    renderHub(admin, {
      ...INITIAL_APP_DATA,
      greenBeanLots: [withProcess, greenLot(unknown, 'GBL-2026-9')],
    })

    expect(row(unknown).getAllByText('Unknown')).not.toHaveLength(0)
    expect(processOptions()).toEqual(['All', 'Washed', 'Unknown'])

    fireEvent.click(screen.getByRole('button', { name: 'Unknown' }))
    expect(screen.getByTitle(unknown)).toBeInTheDocument()
    expect(screen.queryByTitle(known)).not.toBeInTheDocument()
  })

  it('leaves Unknown out of the filter when every lot has a process', () => {
    renderHub(admin, {
      ...INITIAL_APP_DATA,
      greenBeanLots: [
        withProcess,
        greenLot(external, 'GBL-2026-10', {
          sourceType: GreenBeanSourceType.External,
          externalSource: {
            originName: 'Doi Chang', variety: 'Geisha', processType: 'Natural',
            purchaseDate: '2026-09-01', pricePerKg: 300, currency: 'THB',
          },
        }),
      ],
    })

    expect(row(external).getByText('Natural')).toBeInTheDocument()
    expect(row(external).getByText('Geisha')).toBeInTheDocument()
    expect(processOptions()).toEqual(['All', 'Natural', 'Washed'])
  })
})
