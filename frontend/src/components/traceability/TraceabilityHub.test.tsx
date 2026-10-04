import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { GreenBeanSourceType, UserRole } from '../../types'
import type { AppData, GreenBeanLot, User } from '../../types'
import { generatePublicTraceId } from '../../services/lots/greenBeanLotService'
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
  const lot = (id: string, createdById: string, publicTraceId?: string): GreenBeanLot => ({
    id, createdById, publicTraceId, sourceType: GreenBeanSourceType.Internal, grade: 'Grade A',
    initialWeightKg: 10, currentWeightKg: 10, availabilityStatus: 'Available',
    cuppingScores: [], withdrawalHistory: [],
  })
  const data: AppData = {
    ...INITIAL_APP_DATA,
    greenBeanLots: [
      lot('11111111-0000-4000-8000-000000000001', 'u-proc'),
      lot('22222222-0000-4000-8000-000000000002', 'u-proc', 'pub-mine'),
      lot('33333333-0000-4000-8000-000000000003', 'u-other'),
      lot('44444444-0000-4000-8000-000000000004', 'u-other', 'pub-theirs'),
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

    const dialog = await screen.findByRole('dialog', { name: 'QR Code' })
    expect(within(dialog).getByText(/#\/trace\/pub-theirs/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Regenerate Public ID/ })).not.toBeInTheDocument()
    expect(generatePublicTraceId).not.toHaveBeenCalled()
  })

  it('gives the creator the Regenerate action on their own published QR', async () => {
    renderHub(processor, data)

    fireEvent.click(row(minePublished).getByRole('button', { name: /QR/ }))

    const dialog = await screen.findByRole('dialog', { name: 'QR Code' })
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
