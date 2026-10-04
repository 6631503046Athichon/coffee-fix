/**
 * Auth hardening (audit F28, F29, F30):
 * - F28: an unexpected error answers a generic 500 (the text stays in the
 *   server log), a bad ?role= on GET /users is a 400 before Prisma sees it,
 *   and /health no longer returns the database error to anonymous callers.
 *   A bare SyntaxError is unexpected too (JSON.parse on stored data); a
 *   route that reads its own body answers 400 for one that is not JSON
 * - F29: login gives an unknown identifier, a wrong password and a disabled
 *   account with a wrong password the same 401 after the same bcrypt work;
 *   "This account is disabled" only follows a correct password
 * - F30: every password change sets User.passwordChangedAt and requireAuth
 *   refuses tokens issued before it, also on its 10 s cache; the session that
 *   made the change gets a fresh cookie and stays signed in (an Admin who
 *   sets their own password through the Admin edit is still sent to
 *   first-login setup, as every Admin reset sets mustChangePassword)
 *
 * Real middleware, auth and rate limiter; only Prisma is faked.
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

type Row = Record<string, any>

let users: Row[] = []
let resetTokens: Row[] = []

const pick = (row: Row, select?: Record<string, boolean>) => {
  if (!select) return { ...row }
  const out: Row = {}
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key]
  return out
}

const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) => value !== undefined && row[key] === value)

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(async (args: any) => {
      const row = users.find((u) => matches(u, args.where))
      return row ? pick(row, args.select) : null
    }),
    findFirst: jest.fn(async (args: any) => {
      const row = users.find((u) => matches(u, args.where))
      return row ? pick(row, args.select) : null
    }),
    findMany: jest.fn(async (args: any) => users.map((u) => pick(u, args?.select))),
    update: jest.fn(async (args: any) => {
      const row = users.find((u) => matches(u, args.where))
      if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' })
      Object.assign(row, args.data)
      return pick(row, args.select)
    }),
  },
  passwordResetToken: {
    findUnique: jest.fn(async (args: any) => {
      const row = resetTokens.find((t) => matches(t, args.where))
      if (!row) return null
      return args.include?.user ? { ...row, user: users.find((u) => u.id === row.userId) } : { ...row }
    }),
    update: jest.fn(async (args: any) => {
      const row = resetTokens.find((t) => matches(t, args.where))
      Object.assign(row!, args.data)
      return row
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  processType: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
  $queryRaw: jest.fn(async () => [{ '?column?': 1 }]),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

const PASSWORD = 'RightPass123'
let passwordHash = ''

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4)
})

// Fresh ids per test: requireAuth's 10 s cache lives for the whole file.
let seq = 0
const account = (over: Row = {}): Row => {
  seq += 1
  return {
    id: `ah-${seq}`,
    name: `User ${seq}`,
    username: `user_ah_${seq}`,
    email: `user${seq}@example.com`,
    password: passwordHash,
    roles: ['Roaster'],
    isActive: true,
    isSuperAdmin: false,
    mustChangePassword: false,
    mustChangeUsername: false,
    mustChangeEmail: false,
    passwordChangedAt: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...over,
  }
}

const SECRET = () => process.env.JWT_SECRET as string

// A token as login signs it, issued `secondsAgo` before now.
const tokenIssued = (row: Row, secondsAgo = 0) =>
  jwt.sign(
    { userId: row.id, roles: row.roles, iat: Math.floor(Date.now() / 1000) - secondsAgo },
    SECRET(),
    { expiresIn: '24h', algorithm: 'HS256', issuer: 'coffee-lab-api', audience: 'coffee-lab-app' },
  )

const req = (
  path: string,
  init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
) =>
  new NextRequest(`http://localhost:3001/api/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': init.ip ?? '10.0.0.9',
      ...(init.token ? { Cookie: `auth-token=${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

// GET /users/:id on one's own profile: any route behind requireAuth would do.
const ownProfile = async (row: Row, token: string) => {
  const { GET } = await import('@/app/api/users/[id]/route')
  return GET(req(`users/${row.id}`, { token }), { params: Promise.resolve({ id: row.id }) })
}

const putUser = async (id: string, token: string, body: Row) => {
  const { PUT } = await import('@/app/api/users/[id]/route')
  return PUT(req(`users/${id}`, { method: 'PUT', token, body }), { params: Promise.resolve({ id }) })
}

const login = async (identifier: string, password: string) => {
  const { POST } = await import('@/app/api/auth/login/route')
  return POST(req('auth/login', { method: 'POST', body: { email: identifier, password } }))
}

// The auth-token a response sets, if any.
const cookieToken = (res: Response): string | null => {
  const header = res.headers.get('set-cookie') ?? ''
  const match = header.match(/auth-token=([^;]+)/)
  return match ? match[1] : null
}

let consoleError: any

beforeEach(() => {
  jest.clearAllMocks()
  users = []
  resetTokens = []
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('F28: no internal error text reaches the client', () => {
  test('an unexpected error answers a generic 500 and is logged on the server', async () => {
    const { handleApiError } = await import('@/lib/middleware')
    const prismaText =
      'Invalid `prisma.user.findMany()` invocation:\n{ where: { roles: { has: "Bogus" } } }\nInvalid value for argument `has`. Expected UserRole.'
    const res = handleApiError(new Error(prismaText))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal server error' })
    expect(JSON.stringify(body)).not.toContain('prisma')
    expect(consoleError).toHaveBeenCalled()
  })

  test('an error thrown on purpose with a 4xx statusCode keeps its message', async () => {
    const { handleApiError, SETUP_REQUIRED_MESSAGE } = await import('@/lib/middleware')
    const res = handleApiError(Object.assign(new Error(SETUP_REQUIRED_MESSAGE), { statusCode: 403 }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(SETUP_REQUIRED_MESSAGE)
  })

  test('a 5xx statusCode does not let the message through', async () => {
    const { handleApiError } = await import('@/lib/middleware')
    const res = handleApiError(Object.assign(new Error('connect to db-host:5432 as postgres'), { statusCode: 502 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Internal server error')
  })

  test('a bare SyntaxError is a generic 500 without the parser text, not a 400', async () => {
    // It may come from JSON.parse on stored data in a GET: a server fault,
    // so the client is not told its request was bad.
    const { handleApiError } = await import('@/lib/middleware')
    let parseError: unknown
    try {
      JSON.parse('{nope')
    } catch (error) {
      parseError = error
    }
    const res = handleApiError(parseError)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Internal server error')
  })

  test('GET /api/process-types with a malformed stored colour scheme is a 500, not "Invalid JSON body"', async () => {
    const row = account()
    users.push(row)
    mockPrisma.processType.findMany.mockResolvedValueOnce([
      { id: 'pt-1', name: 'Washed', colorScheme: '{bad', isActive: true },
    ])
    const { GET } = await import('@/app/api/process-types/route')
    const res = await GET(req('process-types', { token: tokenIssued(row) }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Internal server error')
  })

  test('a route that reads its own body still answers 400 for one that is not JSON', async () => {
    const row = account()
    users.push(row)
    const { PUT } = await import('@/app/api/users/[id]/route')
    const res = await PUT(
      new NextRequest(`http://localhost:3001/api/users/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: `auth-token=${tokenIssued(row)}` },
        body: '{nope',
      }),
      { params: Promise.resolve({ id: row.id }) },
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid JSON body')
  })

  test('the known mappings still apply', async () => {
    const { handleApiError } = await import('@/lib/middleware')
    expect(handleApiError(Object.assign(new Error('x'), { code: 'P2002' })).status).toBe(409)
    expect(handleApiError(Object.assign(new Error('x'), { code: 'P2025' })).status).toBe(404)
    expect(handleApiError(new Error('Insufficient permissions')).status).toBe(403)
    expect(handleApiError(new Error('Unauthorized')).status).toBe(401)
    expect(handleApiError(Object.assign(new Error('x'), { code: 'P1001' })).status).toBe(503)
  })

  describe('GET /api/users?role=', () => {
    const listUsers = async (row: Row, query: string) => {
      const { GET } = await import('@/app/api/users/route')
      return GET(req(`users${query}`, { token: tokenIssued(row) }))
    }

    test('an unknown role is a 400 and never reaches Prisma', async () => {
      for (const roles of [['Admin'], ['Roaster']]) {
        const row = account({ roles })
        users.push(row)
        const res = await listUsers(row, '?role=Bogus')
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('Invalid role')
      }
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
    })

    test('a real role still filters', async () => {
      const row = account({ roles: ['Processor'] })
      users.push(row)
      const res = await listUsers(row, '?role=Roaster')
      expect(res.status).toBe(200)
      expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({ isActive: true, roles: { has: 'Roaster' } })
    })

    test('a Prisma failure answers a generic 500', async () => {
      const row = account({ roles: ['Admin'] })
      users.push(row)
      mockPrisma.user.findMany.mockRejectedValueOnce(
        new Error('Invalid `prisma.user.findMany()` invocation: column "User"."roles" does not exist'),
      )
      const res = await listUsers(row, '?role=Farmer')
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'Internal server error' })
    })

    test('a super admin without the Admin role gets the full list', async () => {
      const row = account({ roles: ['Roaster'], isSuperAdmin: true })
      users.push(row)
      const res = await listUsers(row, '')
      expect(res.status).toBe(200)
      const args = mockPrisma.user.findMany.mock.calls[0][0]
      expect(args.where).toEqual({})
      expect(args.select.email).toBe(true)
    })
  })

  test('/health answers 503 without the database error text', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(
      new Error("Can't reach database server at `db.secret-project.supabase.co:5432`"),
    )
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.error).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('supabase')
    // Still logged for the operator.
    expect(String(consoleError.mock.calls[0]?.[1])).toContain('supabase')
  })
})

describe('F29: login does not tell whether an account exists or is disabled', () => {
  const bodyOf = async (res: Response) => ({ status: res.status, body: await res.json() })

  test('unknown, wrong password and disabled + wrong password all get the same 401', async () => {
    const active = account()
    const disabled = account({ isActive: false })
    users.push(active, disabled)

    const unknown = await bodyOf(await login('nobody_here', 'Whatever123'))
    const wrong = await bodyOf(await login(active.username, 'Whatever123'))
    const disabledWrong = await bodyOf(await login(disabled.username, 'Whatever123'))

    expect(unknown).toEqual({ status: 401, body: { error: 'Invalid email or password' } })
    expect(wrong).toEqual(unknown)
    expect(disabledWrong).toEqual(unknown)
  })

  test('an unknown identifier still pays for a bcrypt compare', async () => {
    const compare: any = jest.spyOn(bcrypt, 'compare')
    try {
      const res = await login('nobody@example.com', 'Whatever123')
      expect(res.status).toBe(401)
      expect(compare).toHaveBeenCalledTimes(1)
      // A real cost-10 hash, as hashPassword makes, so it takes as long.
      expect(String(compare.mock.calls[0][1])).toMatch(/^\$2[aby]\$10\$/)
    } finally {
      compare.mockRestore()
    }
  })

  test('a disabled account is named only after the correct password', async () => {
    const disabled = account({ isActive: false })
    users.push(disabled)
    const res = await login(disabled.username, PASSWORD)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('This account is disabled')
    expect(cookieToken(res)).toBeNull()
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('the right password on an active account still signs in', async () => {
    const row = account()
    users.push(row)
    const res = await login(row.username, PASSWORD)
    expect(res.status).toBe(200)
    expect(cookieToken(res)).toBeTruthy()
  })
})

describe('F30: a password change signs out older sessions', () => {
  test('a token issued before passwordChangedAt is refused, a later one is not', async () => {
    const row = account({ passwordChangedAt: new Date(Date.now() - 60_000) })
    users.push(row)
    expect((await ownProfile(row, tokenIssued(row, 120))).status).toBe(401)
    expect((await ownProfile(row, tokenIssued(row, 30))).status).toBe(200)
  })

  test('NULL passwordChangedAt (no change since the column was added) signs nobody out', async () => {
    const row = account({ passwordChangedAt: null })
    users.push(row)
    expect((await ownProfile(row, tokenIssued(row, 60 * 60 * 20))).status).toBe(200)
  })

  test('the cached copy is checked too', async () => {
    // A new token is seen first and caches the row with its passwordChangedAt;
    // the older token must not ride on that cache entry.
    const row = account({ passwordChangedAt: new Date(Date.now() - 60_000) })
    users.push(row)
    expect((await ownProfile(row, tokenIssued(row))).status).toBe(200)
    const reads = mockPrisma.user.findUnique.mock.calls.length
    expect((await ownProfile(row, tokenIssued(row, 120))).status).toBe(401)
    // That refusal came from the cache: requireAuth did not read the row again.
    const authReads = mockPrisma.user.findUnique.mock.calls
      .slice(reads)
      .filter((call: any) => call[0]?.select?.passwordChangedAt)
    expect(authReads).toHaveLength(0)
  })

  test('isTokenRevoked compares in whole seconds, as iat is', async () => {
    const { isTokenRevoked } = await import('@/lib/middleware')
    const changed = new Date('2026-10-04T05:00:00.700Z')
    const second = Math.floor(changed.getTime() / 1000)
    expect(isTokenRevoked(second - 1, changed)).toBe(true)
    // Issued in the same second, just after the change: the fresh cookie.
    expect(isTokenRevoked(second, changed)).toBe(false)
    expect(isTokenRevoked(undefined, changed)).toBe(true)
    expect(isTokenRevoked(undefined, null)).toBe(false)
  })

  describe('PUT /api/users/:id', () => {
    test("the user's own change signs out the old session and keeps this one", async () => {
      const row = account()
      users.push(row)
      const stolen = tokenIssued(row, 5)
      const mine = tokenIssued(row, 5)
      // Both work, and the row is now in requireAuth's cache.
      expect((await ownProfile(row, stolen)).status).toBe(200)

      const res = await putUser(row.id, mine, { password: 'NewPass456', currentPassword: PASSWORD })
      expect(res.status).toBe(200)
      expect(row.passwordChangedAt).toBeInstanceOf(Date)

      const fresh = cookieToken(res)
      expect(fresh).toBeTruthy()
      // At once, on this instance: the cached copy was dropped.
      expect((await ownProfile(row, stolen)).status).toBe(401)
      expect((await ownProfile(row, fresh!)).status).toBe(200)
    })

    test('a profile edit without a password change leaves sessions alone', async () => {
      const row = account()
      users.push(row)
      const token = tokenIssued(row, 5)
      const res = await putUser(row.id, token, { name: 'Renamed' })
      expect(res.status).toBe(200)
      expect(row.passwordChangedAt).toBeNull()
      expect(cookieToken(res)).toBeNull()
      expect((await ownProfile(row, token)).status).toBe(200)
    })

    test("an Admin's reset signs the user out everywhere and keeps the Admin's session", async () => {
      const admin = account({ roles: ['Admin'] })
      const target = account({ roles: ['Farmer'] })
      users.push(admin, target)
      const targetToken = tokenIssued(target, 5)
      const adminToken = tokenIssued(admin, 5)
      expect((await ownProfile(target, targetToken)).status).toBe(200)

      const res = await putUser(target.id, adminToken, { password: 'Generated99x' })
      expect(res.status).toBe(200)
      expect(target.passwordChangedAt).toBeInstanceOf(Date)
      // Not the target's session to refresh.
      expect(cookieToken(res)).toBeNull()

      expect((await ownProfile(target, targetToken)).status).toBe(401)
      expect((await ownProfile(admin, adminToken)).status).toBe(200)
    })

    test('an Admin changing their own password keeps this session, which then owes first-login setup', async () => {
      const admin = account({ roles: ['Admin'] })
      users.push(admin)
      const adminToken = tokenIssued(admin, 5)
      const res = await putUser(admin.id, adminToken, { password: 'AdminNew123' })
      expect(res.status).toBe(200)
      const fresh = cookieToken(res)
      expect(fresh).toBeTruthy()

      // The fresh cookie is accepted (not revoked by passwordChangedAt): the
      // session check the app makes on load answers 200.
      const { GET: me } = await import('@/app/api/auth/me/route')
      const meRes = await me(req('auth/me', { token: fresh! }))
      expect(meRes.status).toBe(200)
      const { user } = await meRes.json()
      expect(user.id).toBe(admin.id)
      // The Admin edit sets mustChangePassword on every password it saves,
      // the Admin's own included, so other routes send them to setup first.
      expect(user.mustChangePassword).toBe(true)
      const other = await ownProfile(admin, fresh!)
      expect(other.status).toBe(403)
      expect((await other.json()).error).toBe('First-login setup required')

      // The token from before the change is signed out.
      expect((await me(req('auth/me', { token: adminToken }))).status).toBe(401)
    })
  })

  test('first-login setup sets passwordChangedAt and hands this session a fresh cookie', async () => {
    const row = account({ mustChangePassword: true })
    users.push(row)
    const handedOut = tokenIssued(row, 5)
    const { POST } = await import('@/app/api/auth/first-login-update/route')
    const res = await POST(
      req('auth/first-login-update', {
        method: 'POST',
        token: handedOut,
        body: { currentPassword: PASSWORD, newPassword: 'MyOwnPass99' },
      }),
    )
    expect(res.status).toBe(200)
    expect(row.passwordChangedAt).toBeInstanceOf(Date)
    const fresh = cookieToken(res)
    expect(fresh).toBeTruthy()
    expect((await ownProfile(row, fresh!)).status).toBe(200)
    expect((await ownProfile(row, handedOut)).status).toBe(401)
  })

  test('a reset by email link signs out every session', async () => {
    const row = account()
    users.push(row)
    resetTokens.push({
      id: 'rt-1',
      token: 'reset-token-abc',
      userId: row.id,
      used: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    const session = tokenIssued(row, 5)
    expect((await ownProfile(row, session)).status).toBe(200)

    const { POST } = await import('@/app/api/auth/reset-password/route')
    const res = await POST(
      req('auth/reset-password', { method: 'POST', body: { token: 'reset-token-abc', password: 'Reset4567x' } }),
    )
    expect(res.status).toBe(200)
    expect(row.passwordChangedAt).toBeInstanceOf(Date)
    // No session made this request, so none is handed out.
    expect(cookieToken(res)).toBeNull()
    expect((await ownProfile(row, session)).status).toBe(401)

    // Signing in again with the new password works.
    const again = await login(row.username, 'Reset4567x')
    expect(again.status).toBe(200)
    expect((await ownProfile(row, cookieToken(again)!)).status).toBe(200)
  })
})
