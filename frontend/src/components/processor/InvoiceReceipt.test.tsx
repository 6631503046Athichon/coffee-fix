import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { GreenBeanSourceType } from '../../types'
import type { GreenBeanLot } from '../../types'
import {
  generatePublicTraceId,
  generateQRDataUrl,
  getPublicTraceUrl,
} from '../../services/lots/greenBeanLotService'
import InvoiceReceipt from './InvoiceReceipt'

vi.mock('../../services/lots/greenBeanLotService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/lots/greenBeanLotService')>()
  return {
    ...actual,
    generatePublicTraceId: vi.fn(),
    generateQRDataUrl: vi.fn(async (url: string) => `data:image/png;qr,${encodeURIComponent(url)}`),
  }
})

// The QR printed on a sale invoice is for the customer, so it must open the
// PUBLIC trace page (#/trace/<publicTraceId>), never the login-only
// #/traceability/<lotId>. A lot is only published when its owner asks.

const sale = {
  date: '2026-09-30',
  amountKg: 10,
  withdrawalType: 'Sale',
  purpose: 'Sale',
  salePrice: 400,
  currency: 'THB',
  customerName: 'Cafe A',
  invoiceNumber: 'INV-001',
} as NonNullable<GreenBeanLot['withdrawalHistory']>[number]

const makeLot = (overrides: Partial<GreenBeanLot> = {}): GreenBeanLot => ({
  id: 'gbl-1', displayId: 'GBL-2026-7', sourceType: GreenBeanSourceType.Internal,
  createdById: 'processor', grade: 'Grade A', initialWeightKg: 50, currentWeightKg: 40,
  availabilityStatus: 'Available', cuppingScores: [], withdrawalHistory: [sale],
  ...overrides,
})

const renderInvoice = (props: Partial<React.ComponentProps<typeof InvoiceReceipt>> = {}) =>
  render(
    <InvoiceReceipt visible onClose={() => {}} lot={makeLot()} entry={sale} {...props} />,
  )

const qrImage = () => screen.findByRole('img', { name: 'Traceability QR' })

describe('InvoiceReceipt traceability QR', () => {
  beforeEach(() => vi.clearAllMocks())

  it('points the QR at the public trace page when the lot already has a public id', async () => {
    const publicUrl = getPublicTraceUrl('pub-123')
    renderInvoice({ lot: makeLot({ publicTraceId: 'pub-123' }), canGeneratePublicLink: true })

    expect(await qrImage()).toHaveAttribute('src', `data:image/png;qr,${encodeURIComponent(publicUrl)}`)
    expect(vi.mocked(generateQRDataUrl)).toHaveBeenCalledWith(publicUrl, expect.anything())
    expect(publicUrl).toContain('/#/trace/pub-123')
    expect(screen.getByText(publicUrl)).toBeInTheDocument()
    expect(screen.queryByText(/#\/traceability\//)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create public trace link' })).not.toBeInTheDocument()
  })

  it('offers an on-screen button, and no QR, when the lot has no public id', () => {
    renderInvoice({ canGeneratePublicLink: true })

    const button = screen.getByRole('button', { name: 'Create public trace link' })
    expect(screen.getByTestId('invoice-trace-create')).toHaveClass('print:hidden')
    expect(button).toBeEnabled()
    expect(screen.queryByRole('img', { name: 'Traceability QR' })).not.toBeInTheDocument()
    expect(screen.queryByText(/#\/traceability\//)).not.toBeInTheDocument()
    // Never published on its own: only the button creates the link.
    expect(vi.mocked(generatePublicTraceId)).not.toHaveBeenCalled()
    expect(vi.mocked(generateQRDataUrl)).not.toHaveBeenCalled()
  })

  it('shows the public QR once the owner creates the link', async () => {
    vi.mocked(generatePublicTraceId).mockResolvedValue({
      publicTraceId: 'pub-new',
      publicUrl: '/trace/pub-new',
      greenBeanLot: { id: 'gbl-1', publicTraceId: 'pub-new', qrGeneratedAt: '2026-10-05T00:00:00Z' },
    })
    const onPublicTraceIdGenerated = vi.fn()
    renderInvoice({ canGeneratePublicLink: true, onPublicTraceIdGenerated })

    fireEvent.click(screen.getByRole('button', { name: 'Create public trace link' }))

    const publicUrl = getPublicTraceUrl('pub-new')
    expect(await qrImage()).toHaveAttribute('src', `data:image/png;qr,${encodeURIComponent(publicUrl)}`)
    expect(vi.mocked(generatePublicTraceId)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(generatePublicTraceId)).toHaveBeenCalledWith('gbl-1')
    expect(onPublicTraceIdGenerated).toHaveBeenCalledWith('pub-new')
    expect(screen.getByText(publicUrl)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create public trace link' })).not.toBeInTheDocument()
  })

  it('keeps the button and says why when creating the link fails', async () => {
    vi.mocked(generatePublicTraceId).mockRejectedValue(new Error('Forbidden'))
    renderInvoice({ canGeneratePublicLink: true })

    fireEvent.click(screen.getByRole('button', { name: 'Create public trace link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create public trace link' })).toBeEnabled(),
    )
    expect(screen.queryByRole('img', { name: 'Traceability QR' })).not.toBeInTheDocument()
  })

  it('hides the QR block and shows a note for a viewer who cannot create the link', () => {
    renderInvoice({ canGeneratePublicLink: false })

    expect(screen.queryByRole('img', { name: 'Traceability QR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create public trace link' })).not.toBeInTheDocument()
    expect(screen.queryByText('Scan for Traceability')).not.toBeInTheDocument()
    const note = screen.getByTestId('invoice-trace-unavailable')
    expect(note).toHaveTextContent('No public trace link for this lot yet')
    expect(note).toHaveClass('print:hidden')
    expect(vi.mocked(generatePublicTraceId)).not.toHaveBeenCalled()
  })
})
