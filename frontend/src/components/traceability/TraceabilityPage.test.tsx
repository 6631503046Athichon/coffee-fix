import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/traceability/:lotId" element={<TraceabilityPage />} />
        <Route path="/trace/:publicId" element={<PublicTraceabilityPage />} />
      </Routes>
    </MemoryRouter>,
  )

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
