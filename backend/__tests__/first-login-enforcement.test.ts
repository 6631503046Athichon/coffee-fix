/**
 * First-login setup, enforced on the server (audit F9 follow-ups):
 * - requireAuth refuses (403) an account that still owes its setup, except on
 *   /auth/me and /auth/first-login-update, so the password the Admin handed
 *   out cannot be used against the API directly; such an account is never
 *   cached, so the request after setup is saved goes through at once
 * - first-login-update is rate limited per account, not per IP, so people
 *   onboarding on one network do not share 10 attempts
 * - login finds the lowercased username or email setup saved even when the
 *   user types capitals, and an identifier with '@' matches emails only
 * - an Admin-typed password (autoGenerate: false) must be changed at first
 *   login too
 *
 * Real middleware, auth and rate limiter; only Prisma is faked.
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

type Row = Record<string, any>

let users: Row[] = []

const pick = (row: Row, select?: Record<string, boolean>) => {
  if (!select) return { ...row }
  const out: Row = {}
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key]
  return out
}

const findRow = (where: Row) =>
  users.find((u) =>
    Object.entries(where).every(([key, value]) => value !== undefined && u[key] === value)
  )

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(async (args: any) => {
      const row = findRow(args.where)
      return row ? pick(row, args.select) : null
    }),
    findFirst: jest.fn(async (args: any) => {
      const row = findRow(args.where)
      return row ? pick(row, args.select) : null
    }),
    update: jest.fn(async (args: any) => {
      const row = findRow(args.where)
      if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' })
      Object.assign(row, args.data)
      return pick(row, args.select)
    }),
    create: jest.fn(async (args: any) => ({ id: 'u-created', ...args.data })),
  },
  roastBatch: { findMany: jest.fn(async () => []) },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

const TEMP_PASSWORD = 'TempPass123'
let tempHash = ''

beforeAll(async () => {
  tempHash = await bcrypt.hash(TEMP_PASSWORD, 4)
})

// Each test uses fresh ids: requireAuth's 10 s cache lives for the whole file.
let seq = 0
const account = (over: Row = {}): Row => {
  seq += 1
  return {
    id: `u-${seq}`,
    name: `User ${seq}`,
    username: `user_${seq}`,
    email: null,
    password: tempHash,
    roles: ['Roaster'],
    isActive: true,
    isSuperAdmin: false,
    mustChangePassword: false,
    mustChangeUsername: false,
    mustChangeEmail: false,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...over,
  }
}
const newcomer = (over: Row = {}) =>
  account({ mustChangePassword: true, mustChangeUsername: true, mustChangeEmail: true, ...over })

let tokenFor: (row: Row) => string

beforeAll(async () => {
  const { generateToken } = await import('@/lib/auth')
  tokenFor = (row) => generateToken({ userId: row.id, roles: row.roles })
})

const req = (path: string, row: Row | null, init: { method?: string; body?: unknown; ip?: string } = {}) =>
  new NextRequest(`http://localhost:3001/api/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': init.ip ?? '10.0.0.1',
      ...(row ? { Cookie: `auth-token=${tokenFor(row)}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

const me = async (row: Row) => {
  const { GET } = await import('@/app/api/auth/me/route')
  return GET(req('auth/me', row))
}
const roasts = async (row: Row) => {
  const { GET } = await import('@/app/api/roast-batches/route')
  return GET(req('roast-batches', row))
}
const setup = async (row: Row, body: Row, ip?: string) => {
  const { POST } = await import('@/app/api/auth/first-login-update/route')
  return POST(req('auth/first-login-update', row, { method: 'POST', body, ip }))
}
const login = async (identifier: string, password = TEMP_PASSWORD) => {
  const { POST } = await import('@/app/api/auth/login/route')
  return POST(req('auth/login', null, { method: 'POST', body: { email: identifier, password } }))
}

beforeEach(() => {
  jest.clearAllMocks()
  users = []
})

describe('requireAuth holds an account on its first-login setup', () => {
  test('any other route answers 403 while a flag is set', async () => {
    for (const flag of ['mustChangePassword', 'mustChangeUsername', 'mustChangeEmail']) {
      const row = account({ [flag]: true })
      users.push(row)
      const res = await roasts(row)
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe('First-login setup required')
    }
    expect(mockPrisma.roastBatch.findMany).not.toHaveBeenCalled()
  })

  test('an account with setup done gets through', async () => {
    const row = account()
    users.push(row)
    expect((await roasts(row)).status).toBe(200)
  })

  test('/auth/me still answers, with the flags the setup page needs', async () => {
    const row = newcomer()
    users.push(row)
    const res = await me(row)
    expect(res.status).toBe(200)
    expect((await res.json()).user.mustChangePassword).toBe(true)
  })

  test('/auth/me letting the account through does not open the rest of the API', async () => {
    // Were the account cached on that pass, the cached copy (which carries
    // no flags) would let the next call through.
    const row = newcomer()
    users.push(row)
    expect((await me(row)).status).toBe(200)
    expect((await roasts(row)).status).toBe(403)
  })

  test('first-login-update is allowed, and the next call goes through at once', async () => {
    const row = newcomer()
    users.push(row)
    expect((await roasts(row)).status).toBe(403)

    const res = await setup(row, {
      currentPassword: TEMP_PASSWORD,
      newUsername: `farm_${row.id}`,
      newEmail: `${row.id}@example.com`,
      newPassword: 'MyOwnPass99',
    })
    expect(res.status).toBe(200)

    // No 10 s wait for a cache to expire.
    expect((await roasts(row)).status).toBe(200)
  })
})

describe('first-login-update rate limit', () => {
  const wrong = { currentPassword: 'WrongPass1', newPassword: 'MyOwnPass99' }

  test('a dozen people setting up on one network do not share 10 attempts', async () => {
    const rows = Array.from({ length: 12 }, () => newcomer({ mustChangeUsername: false, mustChangeEmail: false }))
    users.push(...rows)
    for (const row of rows) {
      // A wrong first try each still counts.
      expect((await setup(row, wrong, '203.0.113.7')).status).toBe(400)
    }
    for (const row of rows) {
      const res = await setup(row, { currentPassword: TEMP_PASSWORD, newPassword: 'MyOwnPass99' }, '203.0.113.7')
      expect(res.status).toBe(200)
    }
  })

  test('one account is still capped at about 10 attempts per 15 minutes', async () => {
    const row = newcomer({ mustChangeUsername: false, mustChangeEmail: false })
    users.push(row)
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await setup(row, wrong)).status)
    // The limiter's first request of a fresh window can go uncounted when its
    // periodic cleanup runs, so the cap is 10 or 11; either way it holds.
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400))
    expect(statuses[11]).toBe(429)
  })
})

describe('login after setup', () => {
  test('a username typed with capitals finds the lowercase one setup saved', async () => {
    const row = newcomer()
    users.push(row)
    const res = await setup(row, {
      currentPassword: TEMP_PASSWORD,
      newUsername: 'Somchai_Farm',
      newEmail: 'Somchai@Gmail.com',
      newPassword: 'MyOwnPass99',
    })
    expect(res.status).toBe(200)
    expect(row.username).toBe('somchai_farm')

    expect((await login('Somchai_Farm', 'MyOwnPass99')).status).toBe(200)
    expect((await login('somchai_farm', 'MyOwnPass99')).status).toBe(200)
    expect((await login('Somchai@Gmail.com', 'MyOwnPass99')).status).toBe(200)
  })

  test('an older mixed-case username still matches exactly', async () => {
    users.push(account({ username: 'Fern.Farmer' }))
    expect((await login('Fern.Farmer')).status).toBe(200)
  })

  test("an identifier with '@' matches emails only, never an older username", async () => {
    // Saved before usernames lost '@': X's username is Y's email.
    const victim = account({ username: 'victim_01', email: 'victim@farm.com' })
    const squatter = account({ username: 'victim@farm.com', password: await bcrypt.hash('Squat1234', 4) })
    users.push(squatter, victim)

    // The squatter's password no longer opens anything under that name...
    expect((await login('victim@farm.com', 'Squat1234')).status).toBe(401)
    // ...and the victim signs in with their own email and password.
    const res = await login('victim@farm.com')
    expect(res.status).toBe(200)
    expect((await res.json()).user.id).toBe(victim.id)
  })

  test('a wrong password is still a 401', async () => {
    users.push(account({ username: 'somchai_farm' }))
    expect((await login('Somchai_Farm', 'Nope12345')).status).toBe(401)
  })
})

describe('POST /api/users with an Admin-typed password', () => {
  test('the user must change it at first login', async () => {
    const admin = account({ roles: ['Admin'] })
    users.push(admin)
    const { POST } = await import('@/app/api/users/route')
    const res = await POST(
      req('users', admin, {
        method: 'POST',
        body: { name: 'Farmer X', username: 'farmer_x', password: '123456', roles: ['Farmer'], autoGenerate: false },
      }),
    )
    expect(res.status).toBe(201)
    const data = mockPrisma.user.create.mock.calls[0][0].data
    expect(data.mustChangePassword).toBe(true)
    // The Admin chose these, so they are not owed.
    expect(data.mustChangeUsername).toBe(false)
    expect(data.mustChangeEmail).toBe(false)
  })
})
