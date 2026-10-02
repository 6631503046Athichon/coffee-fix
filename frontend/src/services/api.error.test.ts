import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { ApiError } from './apiError'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('api error answers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("throw an ApiError with the backend's message, status and body", async () => {
    const body = {
      error: 'This lot has already been processed',
      dependents: { processingBatches: 1, parchmentLots: 1, greenBeanLots: 2, withdrawals: 3 },
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, body)))

    const error = await api.delete('/harvest-lots/hl-1').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    // Still a plain Error to every caller that reads only the message.
    expect(error).toBeInstanceOf(Error)
    expect((error as ApiError).message).toBe('This lot has already been processed')
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).data).toStrictEqual(body)
  })

  it('falls back to the status text when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500, statusText: 'Server Error' })))

    const error = await api.get('/harvest-lots').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Server Error')
    expect((error as ApiError).status).toBe(500)
    expect((error as ApiError).data).toBeNull()
  })
})
