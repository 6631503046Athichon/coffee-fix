import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePublicTraceId } from '../../../services/lots/greenBeanLotService'
import { QRCodeModal } from './QRCodeModal'

vi.mock('../../../services/lots/greenBeanLotService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/lots/greenBeanLotService')>()
  return {
    ...actual,
    generatePublicTraceId: vi.fn(),
    generateQRDataUrl: vi.fn(async (url: string) => `data:image/png;qr,${encodeURIComponent(url)}`),
    generateQRSvg: vi.fn(async () => '<svg />'),
  }
})

// Opening the modal for a lot with no public id creates one, but must never
// replace an id the server already holds (printed QR codes would die). Only
// the explicit "Regenerate Public ID" action asks for a new id. All of that
// is for a viewer who may publish the lot (canGenerate: its creator or an
// Admin); anyone else only sees a QR the lot already has.

const generated = (publicTraceId: string) => ({
  publicTraceId,
  publicUrl: `/trace/${publicTraceId}`,
  greenBeanLot: { id: 'gbl-1', publicTraceId, qrGeneratedAt: '2026-10-05T00:00:00Z' },
})

const renderModal = (props: Partial<React.ComponentProps<typeof QRCodeModal>> = {}) =>
  render(<QRCodeModal isOpen onClose={() => {}} lotId="gbl-1" canGenerate {...props} />)

describe('QRCodeModal public id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('auto-generates without the regenerate flag when the lot has no id', async () => {
    vi.mocked(generatePublicTraceId).mockResolvedValue(generated('pub-server'))
    const onPublicIdGenerated = vi.fn()
    renderModal({ publicTraceId: null, onPublicIdGenerated })

    await waitFor(() => expect(onPublicIdGenerated).toHaveBeenCalledWith('pub-server'))
    expect(generatePublicTraceId).toHaveBeenCalledTimes(1)
    expect(generatePublicTraceId).toHaveBeenCalledWith('gbl-1', false)
    expect(await screen.findByText(/#\/trace\/pub-server/)).toBeInTheDocument()
  })

  it('does not call the server when the lot already has an id', () => {
    renderModal({ publicTraceId: 'pub-old' })
    expect(generatePublicTraceId).not.toHaveBeenCalled()
    expect(screen.getByText(/#\/trace\/pub-old/)).toBeInTheDocument()
  })

  // Regenerating kills the current link, so it asks first in a site popup.
  const confirmDialog = () => screen.queryByRole('dialog', { name: /Regenerate the public link\?/ })

  it('asks before regenerating, and Cancel keeps the current link', async () => {
    renderModal({ publicTraceId: 'pub-old' })

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Public ID/ }))

    const dialog = confirmDialog() as HTMLElement
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Printed QR codes and invoices with the current link will stop working.')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(confirmDialog()).not.toBeInTheDocument()
    // The current QR is still drawn for the current link.
    expect(decodeURIComponent((await screen.findByAltText('QR Code') as HTMLImageElement).src)).toContain('#/trace/pub-old')
    expect(generatePublicTraceId).not.toHaveBeenCalled()
    expect(screen.getByText(/#\/trace\/pub-old/)).toBeInTheDocument()
  })

  it('passes regenerate: true once the regenerate popup is confirmed', async () => {
    vi.mocked(generatePublicTraceId).mockResolvedValue(generated('pub-new'))
    const onPublicIdGenerated = vi.fn()
    renderModal({ publicTraceId: 'pub-old', onPublicIdGenerated })

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Public ID/ }))
    expect(generatePublicTraceId).not.toHaveBeenCalled()
    fireEvent.click(within(confirmDialog() as HTMLElement).getByRole('button', { name: /Regenerate link/ }))

    expect(confirmDialog()).not.toBeInTheDocument()
    await waitFor(() => expect(onPublicIdGenerated).toHaveBeenCalledWith('pub-new'))
    expect(generatePublicTraceId).toHaveBeenCalledTimes(1)
    expect(generatePublicTraceId).toHaveBeenCalledWith('gbl-1', true)
  })

  it('names the lot by its lot number in the title', () => {
    renderModal({ publicTraceId: 'pub-old', lotLabel: 'GBL-2026-7' })

    expect(screen.getByRole('dialog', { name: 'QR Code · GBL-2026-7' })).toBeInTheDocument()
  })

  it('retries a failed first-time generate without the regenerate flag', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(generatePublicTraceId).mockRejectedValueOnce(new Error('Network down'))
    renderModal({ publicTraceId: null })

    const retry = await screen.findByRole('button', { name: /Generate Public ID/ })
    vi.mocked(generatePublicTraceId).mockResolvedValue(generated('pub-server'))
    fireEvent.click(retry)

    expect(await screen.findByText(/#\/trace\/pub-server/)).toBeInTheDocument()
    expect(generatePublicTraceId).toHaveBeenCalledTimes(2)
    for (const call of vi.mocked(generatePublicTraceId).mock.calls) {
      expect(call).toEqual(['gbl-1', false])
    }
    consoleError.mockRestore()
  })
})

describe('QRCodeModal for a viewer who may not publish the lot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not generate a public id, and says only the owner or an Admin can publish it', async () => {
    renderModal({ publicTraceId: null, canGenerate: false })

    expect(screen.getByText(/This lot has no public QR code yet\. Only the lot's processor or an Admin can publish it\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Generate Public ID/ })).not.toBeInTheDocument()
    // Give the auto-generate effect its chance to (wrongly) fire.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(generatePublicTraceId).not.toHaveBeenCalled()
  })

  it('shows the published QR without the Regenerate action', () => {
    renderModal({ publicTraceId: 'pub-old', canGenerate: false })

    expect(screen.getByText(/#\/trace\/pub-old/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Regenerate Public ID/ })).not.toBeInTheDocument()
    expect(generatePublicTraceId).not.toHaveBeenCalled()
  })

  it('is off unless the caller says the viewer may publish', async () => {
    render(<QRCodeModal isOpen onClose={() => {}} lotId="gbl-1" publicTraceId={null} />)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(generatePublicTraceId).not.toHaveBeenCalled()
  })
})
