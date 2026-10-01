/**
 * CSRF protection
 *
 * The auth cookie used to be SameSite=None and nothing checked where a
 * state-changing request came from, so any site could make a logged-in
 * Admin's browser POST to the API — e.g. a text/plain form to POST /api/users
 * creating an Admin. These tests pin the three layers that close it:
 *   1. src/middleware.ts refuses unsafe requests from other sites (Origin /
 *      Sec-Fetch-Site) and bodies not declared JSON (lib/csrf.ts);
 *   2. validateBody refuses non-JSON bodies with 415;
 *   3. the auth cookie is SameSite=Lax (lib/authCookie.ts).
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const mockPrismaUser = {
  findFirst: jest.fn<(...args: any[]) => any>(),
  findUnique: jest.fn<(...args: any[]) => any>(),
  create: jest.fn<(...args: any[]) => any>(),
  update: jest.fn<(...args: any[]) => any>(),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { user: mockPrismaUser },
}))

jest.mock('@/lib/auth', () => ({
  verifyPassword: jest.fn(async () => true),
  generateToken: jest.fn(() => 'signed-token'),
  hashPassword: jest.fn(async (pwd: string) => `hashed_${pwd}`),
  extractToken: jest.fn(() => null),
  verifyToken: jest.fn(),
}))

const mockRequireAuth = jest.fn<(...args: any[]) => any>()

jest.mock('@/lib/middleware', () => {
  const actual = jest.requireActual('@/lib/middleware') as Record<string, unknown>
  return {
    ...actual,
    requireAuth: (...args: any[]) => mockRequireAuth(...args),
  }
})

const env = process.env as Record<string, string | undefined>
const ENV_KEYS = [
  'NODE_ENV',
  'VERCEL',
  'RAILWAY_ENVIRONMENT',
  'FRONTEND_URL',
  'PRODUCTION_FRONTEND_URL',
  'NEXT_PUBLIC_APP_URL',
] as const
let savedEnv: Record<string, string | undefined> = {}

const FRONTEND = 'https://coffee-fix.vercel.app'
const EVIL = 'https://evil.vercel.app'
const ADMIN_PAYLOAD = JSON.stringify({ name: 'Mallory', email: 'm@evil.test', roles: ['Admin'] })

beforeEach(() => {
  savedEnv = {}
  for (const key of ENV_KEYS) savedEnv[key] = env[key]
  env.NODE_ENV = 'test'
  delete env.VERCEL
  delete env.RAILWAY_ENVIRONMENT
  env.FRONTEND_URL = FRONTEND
  delete env.PRODUCTION_FRONTEND_URL
  delete env.NEXT_PUBLIC_APP_URL
  jest.clearAllMocks()
  jest.resetModules()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete env[key]
    else env[key] = savedEnv[key]
  }
})

// Import after env is set: the CORS allowlist is built at module load.
async function runMiddleware(request: NextRequest) {
  const { middleware } = await import('@/middleware')
  return middleware(request)
}

function apiRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {},
  base = 'https://coffee-fix-backend.vercel.app',
) {
  return new NextRequest(`${base}${path}`, init)
}

// NextResponse.next() marks a pass-through with this header.
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1'

describe('middleware: where unsafe requests come from', () => {
  test('a cross-site Origin POST is refused with 403 (the text/plain Admin-creation form)', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: EVIL, 'Content-Type': 'text/plain' },
        body: ADMIN_PAYLOAD,
      }),
    )

    expect(response.status).toBe(403)
    expect(passedThrough(response)).toBe(false)
    expect(await response.json()).toEqual({ error: 'Cross-site request blocked' })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  test('an untrusted Origin is refused even with a JSON body', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: EVIL, 'Content-Type': 'application/json' },
        body: ADMIN_PAYLOAD,
      }),
    )
    expect(response.status).toBe(403)
  })

  test.each(['PUT', 'PATCH', 'DELETE'])('%s from an untrusted Origin is refused', async (method) => {
    const response = await runMiddleware(
      apiRequest('/api/users/u-1', {
        method,
        headers: { Origin: EVIL, 'Content-Type': 'application/json' },
        ...(method === 'DELETE' ? {} : { body: '{}' }),
      }),
    )
    expect(response.status).toBe(403)
  })

  test('Sec-Fetch-Site: cross-site is refused even when the Origin is allowed', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: {
          Origin: FRONTEND,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        body: ADMIN_PAYLOAD,
      }),
    )
    expect(response.status).toBe(403)
  })

  test('Sec-Fetch-Site: cross-site is refused without an Origin header too', async () => {
    const response = await runMiddleware(
      apiRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      }),
    )
    expect(response.status).toBe(403)
  })

  test('the opaque "null" Origin (sandboxed frame, data: URL) is refused', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: 'null', 'Content-Type': 'application/json' },
        body: ADMIN_PAYLOAD,
      }),
    )
    expect(response.status).toBe(403)
  })

  test('a POST from the allowed frontend origin passes and keeps its CORS headers', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: FRONTEND, 'Content-Type': 'application/json' },
        body: ADMIN_PAYLOAD,
      }),
    )

    expect(passedThrough(response)).toBe(true)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(FRONTEND)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    )
  })

  test('a trailing slash in FRONTEND_URL still matches the Origin', async () => {
    env.FRONTEND_URL = `${FRONTEND}/`
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: FRONTEND, 'Content-Type': 'application/json' },
        body: ADMIN_PAYLOAD,
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('PRODUCTION_FRONTEND_URL and NEXT_PUBLIC_APP_URL are trusted', async () => {
    delete env.FRONTEND_URL
    env.PRODUCTION_FRONTEND_URL = 'https://coffee.example.com'
    env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'

    for (const origin of ['https://coffee.example.com', 'https://app.example.com']) {
      const response = await runMiddleware(
        apiRequest('/api/farms', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: '{}',
        }),
      )
      expect(passedThrough(response)).toBe(true)
    }
  })

  test("the backend's own origin is trusted", async () => {
    env.NODE_ENV = 'production'
    const response = await runMiddleware(
      apiRequest('/api/farms', {
        method: 'POST',
        headers: { Origin: 'https://coffee-fix-backend.vercel.app', 'Content-Type': 'application/json' },
        body: '{}',
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('Sec-Fetch-Site: same-origin passes (the SPA through the Vercel rewrite / Vite proxy)', async () => {
    // Through the rewrite the browser fetched the frontend host, so the Origin
    // can be a host this deployment never listed — a preview URL here.
    env.NODE_ENV = 'production'
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: {
          Origin: 'https://coffee-fix-git-feature-team.vercel.app',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
        },
        body: ADMIN_PAYLOAD,
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('a server-to-server call with no Origin and no Sec-Fetch-Site passes', async () => {
    const response = await runMiddleware(
      apiRequest('/api/backfill-display-ids', {
        method: 'POST',
        headers: { Authorization: 'Bearer some-token' },
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('localhost dev servers are trusted outside production only', async () => {
    const devPost = () =>
      apiRequest(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
          body: '{}',
        },
        'http://localhost:3001',
      )

    env.NODE_ENV = 'development'
    expect(passedThrough(await runMiddleware(devPost()))).toBe(true)

    env.NODE_ENV = 'production'
    jest.resetModules()
    expect((await runMiddleware(devPost())).status).toBe(403)
  })
})

describe('middleware: safe methods and public routes are unaffected', () => {
  test('a cross-site GET passes', async () => {
    const response = await runMiddleware(
      apiRequest('/api/farms', {
        headers: { Origin: EVIL, 'Sec-Fetch-Site': 'cross-site' },
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('the cron GET (bearer secret, no browser headers) passes', async () => {
    const response = await runMiddleware(
      apiRequest('/api/cron/weather', {
        headers: { Authorization: 'Bearer cron-secret' },
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('the public trace GET passes from any site', async () => {
    const response = await runMiddleware(
      apiRequest('/api/trace/abc123', {
        headers: { Origin: EVIL, 'Sec-Fetch-Site': 'cross-site' },
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('an OPTIONS preflight is answered as before', async () => {
    const allowed = await runMiddleware(
      apiRequest('/api/users', {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND, 'Access-Control-Request-Method': 'POST' },
      }),
    )
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(FRONTEND)
    expect(allowed.headers.get('Access-Control-Max-Age')).toBe('86400')

    const untrusted = await runMiddleware(
      apiRequest('/api/users', {
        method: 'OPTIONS',
        headers: { Origin: EVIL, 'Access-Control-Request-Method': 'POST' },
      }),
    )
    expect(untrusted.status).toBe(200)
    expect(untrusted.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('middleware: request bodies must be JSON', () => {
  test.each([
    'text/plain',
    'text/plain;charset=UTF-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=----x',
  ])('a %s body to a JSON route is refused with 415', async (contentType) => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: FRONTEND, 'Content-Type': contentType },
        body: ADMIN_PAYLOAD,
      }),
    )

    expect(response.status).toBe(415)
    expect(passedThrough(response)).toBe(false)
    // An allowed origin can still read why.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(FRONTEND)
  })

  test('a body with no Content-Type is refused with 415', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { 'Content-Length': String(ADMIN_PAYLOAD.length) },
      }),
    )
    expect(response.status).toBe(415)
  })

  test('application/json with a charset passes', async () => {
    const response = await runMiddleware(
      apiRequest('/api/users', {
        method: 'POST',
        headers: { Origin: FRONTEND, 'Content-Type': 'application/json; charset=utf-8' },
        body: ADMIN_PAYLOAD,
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('a POST with no body passes (logout)', async () => {
    const response = await runMiddleware(
      apiRequest('/api/auth/logout', {
        method: 'POST',
        headers: { Origin: FRONTEND },
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('an empty urlencoded body passes (curl -d "")', async () => {
    const response = await runMiddleware(
      apiRequest('/api/backfill-display-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '0' },
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('the Excel import keeps taking multipart/form-data', async () => {
    const form = new FormData()
    form.append('file', new Blob(['xlsx bytes']), 'lots.xlsx')
    const response = await runMiddleware(
      apiRequest('/api/parchment-lots/import-excel', {
        method: 'POST',
        headers: { Origin: FRONTEND },
        body: form,
      }),
    )
    expect(passedThrough(response)).toBe(true)
  })

  test('the Excel import still gets the Origin check', async () => {
    const form = new FormData()
    form.append('file', new Blob(['xlsx bytes']), 'lots.xlsx')
    const response = await runMiddleware(
      apiRequest('/api/parchment-lots/import-excel', {
        method: 'POST',
        headers: { Origin: EVIL },
        body: form,
      }),
    )
    expect(response.status).toBe(403)
  })

  test('the Excel import refuses text/plain', async () => {
    const response = await runMiddleware(
      apiRequest('/api/parchment-lots/import-excel', {
        method: 'POST',
        headers: { Origin: FRONTEND, 'Content-Type': 'text/plain' },
        body: 'x',
      }),
    )
    expect(response.status).toBe(415)
  })
})

describe('validateBody: JSON routes refuse other content types', () => {
  const schema = z.object({ name: z.string() })

  test('text/plain is refused with 415 before the body is parsed', async () => {
    const { validateBody } = await import('@/lib/validations')
    const request = new NextRequest('http://localhost:3001/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ name: 'x' }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.status).toBe(415)
    expect(await result.error.json()).toEqual({
      error: 'Unsupported Media Type',
      message: 'Request body must be JSON (Content-Type: application/json)',
    })
  })

  test('a body with no Content-Type is refused with 415', async () => {
    const { validateBody } = await import('@/lib/validations')
    const request = new NextRequest('http://localhost:3001/api/farms', {
      method: 'POST',
      body: new Blob([JSON.stringify({ name: 'x' })]),
    })
    const result = await validateBody(request, schema)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.status).toBe(415)
  })

  test('application/json is parsed as before', async () => {
    const { validateBody } = await import('@/lib/validations')
    const request = new NextRequest('http://localhost:3001/api/farms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name: 'x' }),
    })
    const result = await validateBody(request, schema)
    expect(result).toEqual({ success: true, data: { name: 'x' } })
  })

  test('POST /api/users with a text/plain body creates nobody (415)', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'admin-1',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    const { POST } = await import('@/app/api/users/route')

    const response = await POST(
      new NextRequest('http://localhost:3001/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: ADMIN_PAYLOAD,
      }),
    )

    expect(response.status).toBe(415)
    expect(mockPrismaUser.create).not.toHaveBeenCalled()
  })

  test('POST /api/auth/login with a text/plain body is refused (415)', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const response = await POST(
      new NextRequest('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'pw' }),
      }),
    )
    expect(response.status).toBe(415)
    expect(mockPrismaUser.findFirst).not.toHaveBeenCalled()
    expect(response.cookies.get('auth-token')).toBeUndefined()
  })
})

describe('auth cookie is SameSite=Lax', () => {
  const dbUser = {
    id: 'user-1',
    name: 'Admin',
    email: 'admin@example.com',
    username: 'admin',
    password: 'hashed',
    roles: ['Admin'],
    isActive: true,
    isSuperAdmin: false,
    mustChangePassword: false,
    mustChangeUsername: false,
    mustChangeEmail: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }

  async function login(origin?: string) {
    mockPrismaUser.findFirst.mockResolvedValue(dbUser)
    mockPrismaUser.update.mockResolvedValue(dbUser)
    const { POST } = await import('@/app/api/auth/login/route')
    return POST(
      new NextRequest('https://coffee-fix-backend.vercel.app/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({ email: 'admin@example.com', password: 'correct-password' }),
      }),
    )
  }

  test('login in production sets HttpOnly; Secure; SameSite=Lax — not None', async () => {
    env.NODE_ENV = 'production'
    env.VERCEL = '1'

    // The Origin the old code read to pick SameSite=None.
    const response = await login(FRONTEND)

    expect(response.status).toBe(200)
    const cookie = response.cookies.get('auth-token')
    expect(cookie).toMatchObject({
      value: 'signed-token',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=lax/i)
    expect(response.headers.get('set-cookie')).not.toMatch(/SameSite=none/i)
  })

  test('login on localhost dev sets SameSite=Lax without Secure', async () => {
    env.NODE_ENV = 'development'
    const response = await login('http://localhost:5173')
    expect(response.cookies.get('auth-token')).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })
  })

  test('register (admin-only) sets the cookie SameSite=Lax in production', async () => {
    env.NODE_ENV = 'production'
    mockRequireAuth.mockResolvedValue({ id: 'admin-1', roles: ['Admin'], isActive: true, isSuperAdmin: false })
    mockPrismaUser.findFirst.mockResolvedValue(null)
    mockPrismaUser.create.mockResolvedValue({ ...dbUser, id: 'user-2', mustChangePassword: true })
    const { POST } = await import('@/app/api/auth/register/route')

    const response = await POST(
      new NextRequest('https://coffee-fix-backend.vercel.app/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'new@example.com',
          password: 'password123',
          roles: ['Farmer'],
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(response.cookies.get('auth-token')).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  test('logout clears the cookie with the same attributes', async () => {
    env.NODE_ENV = 'production'
    const { POST } = await import('@/app/api/auth/logout/route')

    const response = await POST(
      new NextRequest('https://coffee-fix-backend.vercel.app/api/auth/logout', { method: 'POST' }),
    )

    expect(response.cookies.get('auth-token')).toMatchObject({
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  })
})
