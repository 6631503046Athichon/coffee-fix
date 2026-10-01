import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Where dev builds send API calls when VITE_API_URL is unset (no Vite proxy).
//
// The backend refuses cross-site writes (Sec-Fetch-Site: cross-site) and its
// SameSite=Lax auth cookie never rides on a cross-site fetch. Browsers count
// localhost and 127.0.0.1 as different sites, so a page opened on
// 127.0.0.1:5173 that called localhost:3001 could not log in. Every module
// that builds an API URL must call the backend on the page's own host.

// The jsdom instance vitest's jsdom environment exposes; reconfigure() moves
// the page to another URL the way opening a different address would.
declare const jsdom: { reconfigure(options: { url: string }): void }

const originalUrl = window.location.href

async function openPageAt(url: string) {
  jsdom.reconfigure({ url })
  // The API base is computed when a module loads, so load them fresh.
  vi.resetModules()
}

beforeEach(() => {
  // frontend/.env.local may set VITE_API_URL=/api for the proxy; these tests
  // are about the default without it.
  vi.stubEnv('VITE_API_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  jsdom.reconfigure({ url: originalUrl })
  vi.resetModules()
})

describe('dev API base without VITE_API_URL', () => {
  test('a page on 127.0.0.1 calls the backend on 127.0.0.1, not localhost', async () => {
    await openPageAt('http://127.0.0.1:5173/')
    const { API_BASE_URL } = await import('./api')

    expect(API_BASE_URL).toBe('http://127.0.0.1:3001/api')
  })

  test('a page on localhost still calls the backend on localhost', async () => {
    await openPageAt('http://localhost:5173/')
    const { API_BASE_URL } = await import('./api')

    expect(API_BASE_URL).toBe('http://localhost:3001/api')
  })

  test('QR code and public trace URLs use the page host too', async () => {
    await openPageAt('http://127.0.0.1:5173/')
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { getQRCodeUrl, getPublicTraceData } = await import('./lots/greenBeanLotService')

    expect(getQRCodeUrl('lot-1', 'svg', 100)).toBe(
      'http://127.0.0.1:3001/api/green-bean-lots/lot-1/qr?format=svg&size=100',
    )
    await getPublicTraceData('pub-1')
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3001/api/trace/pub-1')
  })

  test('the backend recovery probe uses the page host too', async () => {
    await openPageAt('http://127.0.0.1:5173/')
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { connectionManager } = await import('../utils/connectionManager')

    connectionManager.reportFailure()
    await vi.advanceTimersByTimeAsync(15_000)
    connectionManager.stopRecoveryPolling()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

describe('explicit API base', () => {
  test('VITE_API_URL wins in dev (the Vite proxy setup)', async () => {
    vi.stubEnv('VITE_API_URL', '/api')
    await openPageAt('http://127.0.0.1:5173/')
    const { API_BASE_URL } = await import('./api')

    expect(API_BASE_URL).toBe('/api')
  })

  test('production always uses the same-origin /api rewrite', async () => {
    const { resolveApiBaseUrl } = await import('./apiBaseUrl')

    expect(resolveApiBaseUrl(true, 'http://localhost:3001/api', '127.0.0.1')).toBe('/api')
    expect(resolveApiBaseUrl(true, undefined, 'coffee-fix.vercel.app')).toBe('/api')
  })
})
