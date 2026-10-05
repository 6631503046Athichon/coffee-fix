import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { GreenBeanSourceType } from '../../types'
import type { AppData } from '../../types'
import {
  getPublicTraceData,
  getTracePreviewData,
  type PublicTraceData,
} from '../../services/lots/greenBeanLotService'
import TraceabilityPage from './TraceabilityPage'
import PublicTraceabilityPage from './PublicTraceabilityPage'

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/lots/greenBeanLotService')>(),
  getTracePreviewData: vi.fn(),
  getPublicTraceData: vi.fn(),
}))

const story = (traceId: string | null) => ({
  lot: {
    id: 'gbl-1',
    grade: 'Grade B',
    sourceType: 'Internal',
    roastBatches: [],
    parchmentLot: {
      processType: 'Honey',
      harvestLot: { cherryVariety: 'Bourbon', farmPlotLocation: 'Phupha Estate' },
    },
  },
  traceId,
}) as unknown as PublicTraceData

const renderAt = (path: string, data: AppData = INITIAL_APP_DATA) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataContext.Provider
        value={{ data, setData: () => {}, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}
      >
        <Routes>
          <Route path="/traceability/:lotId" element={<TraceabilityPage />} />
          <Route path="/trace/:publicId" element={<PublicTraceabilityPage />} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  )

// The lots the user can read: the header names the lot by its lot number.
const withLot: AppData = {
  ...INITIAL_APP_DATA,
  greenBeanLots: [{
    id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: GreenBeanSourceType.Internal, grade: 'Grade B',
    initialWeightKg: 10, currentWeightKg: 10, availabilityStatus: 'Available',
    cuppingScores: [], withdrawalHistory: [],
  }],
}

const qrImage = () => screen.getByAltText('QR Code') as HTMLImageElement

describe('Staff traceability page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('previews an unpublished lot in the public design without a QR code', async () => {
    vi.mocked(getTracePreviewData).mockResolvedValue(story(null))

    renderAt('/traceability/gbl-1')

    expect(await screen.findByText(/Customers can't open this page yet/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    expect(screen.queryByText("Share This Coffee's Story")).not.toBeInTheDocument()
    expect(screen.queryByAltText('QR Code')).not.toBeInTheDocument()
    expect(getTracePreviewData).toHaveBeenCalledWith('gbl-1')
  })

  it('puts the public address, not the staff address, in the QR of a published lot', async () => {
    vi.mocked(getTracePreviewData).mockResolvedValue(story('pub-9'))

    renderAt('/traceability/gbl-1')

    expect(await screen.findByText(/is public/)).toBeInTheDocument()
    const encoded = decodeURIComponent(qrImage().src)
    expect(encoded).toContain('/#/trace/pub-9')
    expect(encoded).not.toContain('/traceability/')
    expect(screen.getByRole('link', { name: 'Open public page' })).toHaveAttribute(
      'href',
      expect.stringContaining('/#/trace/pub-9'),
    )
  })

  it('names the lot by its lot number, as the hub and the workbench do', async () => {
    vi.mocked(getTracePreviewData).mockResolvedValue(story(null))

    renderAt('/traceability/gbl-1', withLot)

    expect(await screen.findByText(/Customers can't open this page yet/)).toHaveTextContent(/^Preview of GBL-2026-7\./)
    expect(screen.queryByText(/ROA-/)).not.toBeInTheDocument()
  })

  it('names a published lot by its lot number too', async () => {
    vi.mocked(getTracePreviewData).mockResolvedValue(story('pub-9'))

    renderAt('/traceability/gbl-1', withLot)

    expect(await screen.findByText(/is public/)).toHaveTextContent(/^GBL-2026-7 is public\./)
  })

  it('says "this lot" when the lot is not among the lots the user can read', async () => {
    vi.mocked(getTracePreviewData).mockResolvedValue(story(null))

    renderAt('/traceability/gbl-1')

    expect(await screen.findByText(/Customers can't open this page yet/)).toHaveTextContent(/^Preview of this lot\./)
    expect(screen.queryByText(/ROA-/)).not.toBeInTheDocument()
  })

  it('explains a lot the user is not allowed to preview', async () => {
    vi.mocked(getTracePreviewData).mockRejectedValue(new Error('Forbidden'))

    renderAt('/traceability/gbl-1')

    expect(await screen.findByText(/Only the processor who created this lot/)).toBeInTheDocument()
  })
})

describe('Public traceability page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the same story with a QR code for its own public address', async () => {
    vi.mocked(getPublicTraceData).mockResolvedValue(story('pub-9'))

    renderAt('/trace/pub-9')

    expect(await screen.findByRole('heading', { name: 'Bourbon' })).toBeInTheDocument()
    expect(screen.getByText("Share This Coffee's Story")).toBeInTheDocument()
    expect(decodeURIComponent(qrImage().src)).toContain('/#/trace/pub-9')
    expect(getPublicTraceData).toHaveBeenCalledWith('pub-9')
  })
})
