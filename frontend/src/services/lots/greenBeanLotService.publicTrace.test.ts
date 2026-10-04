import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { generatePublicTraceId } from './greenBeanLotService'

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// The public trace id is printed on QR labels and invoices. The backend keeps
// an existing one unless the request says { regenerate: true }, so only an
// explicit Regenerate may send that.

const response = {
  publicTraceId: 'pub-1',
  publicUrl: '/trace/pub-1',
  greenBeanLot: { id: 'gbl-1', publicTraceId: 'pub-1', qrGeneratedAt: '2026-10-05T00:00:00Z' },
}

describe('generatePublicTraceId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.post).mockResolvedValue(response)
  })

  it('asks for the lot\'s id without regenerating by default', async () => {
    await expect(generatePublicTraceId('gbl-1')).resolves.toEqual(response)
    expect(api.post).toHaveBeenCalledWith('/green-bean-lots/gbl-1/generate-public-id', undefined)
  })

  it('sends regenerate: true only when asked', async () => {
    await generatePublicTraceId('gbl-1', true)
    expect(api.post).toHaveBeenLastCalledWith('/green-bean-lots/gbl-1/generate-public-id', { regenerate: true })

    await generatePublicTraceId('gbl-1', false)
    expect(api.post).toHaveBeenLastCalledWith('/green-bean-lots/gbl-1/generate-public-id', undefined)
  })
})
