/**
 * First-login setup and user edits (audit F9, F27):
 * - GET /auth/me returns the mustChange* flags, read from the user row rather
 *   than requireAuth's cached copy, so the client can hold the user on setup
 * - POST /auth/first-login-update answers a wrong current password with 400
 *   (the client signs the user out on any 401), applies the password policy
 *   and usernameSchema (no '@', so a username can never equal an email), and
 *   refuses to keep the password the Admin handed out
 * - PUT /users/:id validates with updateUserSchema + passwordSchema, answers a
 *   wrong current password with 400, and treats a super admin as an Admin
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
    update: jest.fn(async (args: any) => {
      const row = findRow(args.where)
      if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' })
      Object.assign(row, args.data)
      return pick(row, args.select)
    }),
  },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// requireAuth hands back whatever this holds, the way its 10 s cache would.
let mockAuthUser: any = null

jest.mock('@/lib/middleware', () => {
  const actual = jest.requireActual('@/lib/middleware') as Record<string, unknown>
  return {
    ...actual,
    requireAuth: jest.fn(async () => {
      if (!mockAuthUser) throw new Error('Unauthorized')
      return mockAuthUser
    }),
  }
})

const TEMP_PASSWORD = 'TempPass123'
let tempHash = ''
let ownHash = ''

beforeAll(async () => {
  tempHash = await bcrypt.hash(TEMP_PASSWORD, 4)
  ownHash = await bcrypt.hash('OwnPass123', 4)
})

const authOf = (row: Row) => ({
  id: row.id,
  email: row.email,
  username: row.username,
  name: row.name,
  roles: row.roles,
  isActive: row.isActive,
  isSuperAdmin: row.isSuperAdmin,
})

const newcomer = () => ({
  id: 'u-new',
  name: 'New Farmer',
  username: 'farmer_007',
  email: null,
  password: tempHash,
  roles: ['Farmer'],
  isActive: true,
  isSuperAdmin: false,
  mustChangePassword: true,
  mustChangeUsername: true,
  mustChangeEmail: true,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
})

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
  users = []
})

describe('GET /api/auth/me', () => {
  const callMe = async () => {
    const { GET } = await import('@/app/api/auth/me/route')
    return GET(jsonRequest('http://localhost:3001/api/auth/me', 'GET'))
  }

  test('returns the mustChange* flags', async () => {
    const row = { ...newcomer(), mustChangeEmail: false }
    users = [row]
    mockAuthUser = authOf(row)

    const res = await callMe()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.user).toMatchObject({
      id: 'u-new',
      username: 'farmer_007',
      roles: ['Farmer'],
      mustChangePassword: true,
      mustChangeUsername: true,
      mustChangeEmail: false,
    })
    expect(data.user.password).toBeUndefined()
  })

  test('reads the flags from the row, not from the cached auth user', async () => {
    // Setup was just saved: the row is clear, the cache still says "must change".
    const row = {
      ...newcomer(),
      mustChangePassword: false,
      mustChangeUsername: false,
      mustChangeEmail: false,
    }
    users = [row]
    mockAuthUser = { ...authOf(row), mustChangePassword: true, mustChangeUsername: true }

    const data = await (await callMe()).json()

    expect(data.user.mustChangePassword).toBe(false)
    expect(data.user.mustChangeUsername).toBe(false)
    expect(data.user.mustChangeEmail).toBe(false)
  })

  test('401 when the account is gone or disabled', async () => {
    const row = { ...newcomer(), isActive: false }
    users = [row]
    mockAuthUser = authOf({ ...row, isActive: true })

    const res = await callMe()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/first-login-update', () => {
  let row: Row

  beforeEach(() => {
    row = newcomer()
    users = [
      row,
      {
        id: 'u-other',
        name: 'Other User',
        username: 'roaster_001',
        email: 'other@example.com',
        password: 'x',
        roles: ['Roaster'],
        isActive: true,
        isSuperAdmin: false,
      },
    ]
    mockAuthUser = authOf(row)
  })

  const submit = async (body: Record<string, unknown>) => {
    const { POST } = await import('@/app/api/auth/first-login-update/route')
    return POST(jsonRequest('http://localhost:3001/api/auth/first-login-update', 'POST', body))
  }

  const valid = {
    currentPassword: TEMP_PASSWORD,
    newUsername: 'somchai_farm',
    newEmail: 'somchai@example.com',
    newPassword: 'MyOwnPass99',
  }

  test('a wrong current password is a 400 with a message, not a 401', async () => {
    const res = await submit({ ...valid, currentPassword: 'WrongPass1' })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('Current password is incorrect')
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('a missing current password is a 400', async () => {
    const res = await submit({ ...valid, currentPassword: '' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Current password is required')
  })

  test.each([
    ['1'],
    ['newpassword123'], // no uppercase
    ['NEWPASSWORD123'], // no lowercase
    ['NewPassword'], // no digit
    ['Short1a'], // 7 characters
  ])('rejects the weak password %s', async (newPassword) => {
    const res = await submit({ ...valid, newPassword })

    expect(res.status).toBe(400)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('refuses to keep the password the Admin handed out', async () => {
    const res = await submit({ ...valid, newPassword: TEMP_PASSWORD })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/different from the current password/)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test.each([
    ['other@example.com'], // another user's email
    ['me@farm'],
    ['ab'], // too short
    ['has space'],
  ])('rejects the username %s', async (newUsername) => {
    const res = await submit({ ...valid, newUsername })

    expect(res.status).toBe(400)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('rejects a username already taken', async () => {
    const res = await submit({ ...valid, newUsername: 'roaster_001' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Username already taken')
  })

  test('rejects an email already taken, whatever its case', async () => {
    const res = await submit({ ...valid, newEmail: 'Other@Example.com' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Email already taken')
  })

  test('saves valid details and clears every flag', async () => {
    const res = await submit({ ...valid, newUsername: 'Somchai_Farm', newEmail: 'Somchai@Example.com' })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.user).toMatchObject({
      username: 'somchai_farm',
      email: 'somchai@example.com',
      mustChangePassword: false,
      mustChangeUsername: false,
      mustChangeEmail: false,
    })
    expect(data.user.password).toBeUndefined()
    expect(await bcrypt.compare('MyOwnPass99', row.password)).toBe(true)
  })

  test('only the fields still owed are required', async () => {
    row.mustChangeUsername = false
    row.mustChangeEmail = false

    const res = await submit({ currentPassword: TEMP_PASSWORD, newPassword: 'MyOwnPass99' })

    expect(res.status).toBe(200)
    expect(row.username).toBe('farmer_007')
    expect(row.mustChangePassword).toBe(false)
  })
})

describe('PUT /api/users/:id', () => {
  let admin: Row
  let superAdmin: Row
  let farmer: Row
  let other: Row

  beforeEach(() => {
    admin = {
      id: 'u-admin',
      name: 'Adam Admin',
      username: 'admin_001',
      email: 'admin@example.com',
      password: 'x',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    }
    // A super admin is an Admin everywhere, even without the role listed.
    superAdmin = {
      id: 'u-super',
      name: 'Sue Super',
      username: 'owner',
      email: 'owner@example.com',
      password: 'x',
      roles: ['Roaster'],
      isActive: true,
      isSuperAdmin: true,
    }
    farmer = {
      id: 'u-farmer',
      name: 'Fern Farmer',
      // Made before usernameSchema existed: uppercase and a dot.
      username: 'Fern.Farmer',
      email: 'Fern@Example.com',
      password: ownHash,
      roles: ['Farmer'],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: false,
    }
    other = {
      id: 'u-other',
      name: 'Other User',
      username: 'roaster_001',
      email: 'other@example.com',
      password: 'x',
      roles: ['Roaster'],
      isActive: true,
      isSuperAdmin: false,
    }
    users = [admin, superAdmin, farmer, other]
    mockAuthUser = authOf(admin)
  })

  const put = async (id: string, body: Record<string, unknown>) => {
    const { PUT } = await import('@/app/api/users/[id]/route')
    return PUT(jsonRequest(`http://localhost:3001/api/users/${id}`, 'PUT', body), {
      params: Promise.resolve({ id }),
    })
  }

  test.each([['1'], ['abcdefgh'], ['ABCDEFG1'], ['Abcdefgh']])(
    'an Admin cannot set the weak password %s',
    async (password) => {
      const res = await put('u-farmer', { password })

      expect(res.status).toBe(400)
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    }
  )

  test('an Admin reset with a strong password is saved hashed and must be changed', async () => {
    const res = await put('u-farmer', { password: 'Xy7!kQ2#mP9a' })

    expect(res.status).toBe(200)
    expect(farmer.mustChangePassword).toBe(true)
    expect(await bcrypt.compare('Xy7!kQ2#mP9a', farmer.password)).toBe(true)
  })

  test('a username cannot be another user\'s email (no @ at all)', async () => {
    const res = await put('u-farmer', { username: 'other@example.com' })

    expect(res.status).toBe(400)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('an invalid email is a 400', async () => {
    const res = await put('u-farmer', { email: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('an unknown role is a 400', async () => {
    const res = await put('u-farmer', { roles: ['Wizard'] })

    expect(res.status).toBe(400)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  test('the edit form resending an older username and email unchanged still saves', async () => {
    const res = await put('u-farmer', {
      name: 'Fern F. Farmer',
      email: 'Fern@Example.com',
      username: 'Fern.Farmer',
      roles: ['Farmer', 'Processor'],
      isActive: true,
    })

    expect(res.status).toBe(200)
    const data = mockPrisma.user.update.mock.calls[0][0].data
    expect(data).toEqual({ name: 'Fern F. Farmer', roles: ['Farmer', 'Processor'], isActive: true })
  })

  test('a new username is stored in lowercase', async () => {
    const res = await put('u-farmer', { username: 'Fern_Farm' })

    expect(res.status).toBe(200)
    expect(farmer.username).toBe('fern_farm')
  })

  test('a duplicate username is still a 409', async () => {
    const res = await put('u-farmer', { username: 'roaster_001' })
    expect(res.status).toBe(409)
  })

  test('a super admin without the Admin role can edit another user', async () => {
    mockAuthUser = authOf(superAdmin)

    const res = await put('u-farmer', { name: 'Renamed' })

    expect(res.status).toBe(200)
    expect(farmer.name).toBe('Renamed')
  })

  test('a super admin without the Admin role can view another user', async () => {
    mockAuthUser = authOf(superAdmin)
    const { GET } = await import('@/app/api/users/[id]/route')

    const res = await GET(jsonRequest('http://localhost:3001/api/users/u-farmer', 'GET'), {
      params: Promise.resolve({ id: 'u-farmer' }),
    })

    expect(res.status).toBe(200)
  })

  test('a non-admin cannot edit someone else', async () => {
    mockAuthUser = authOf(farmer)

    const res = await put('u-other', { name: 'Hijacked' })

    expect(res.status).toBe(403)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  describe('a user editing their own profile', () => {
    beforeEach(() => {
      mockAuthUser = authOf(farmer)
    })

    test('a wrong current password is a 400, not a 401', async () => {
      const res = await put('u-farmer', { password: 'NewOwnPass1', currentPassword: 'WrongPass1' })
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe('Current password is incorrect')
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })

    test('a weak new password is refused even with the right current password', async () => {
      const res = await put('u-farmer', { password: '1', currentPassword: 'OwnPass123' })

      expect(res.status).toBe(400)
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })

    test('a strong new password with the right current password is saved', async () => {
      const res = await put('u-farmer', { password: 'NewOwnPass1', currentPassword: 'OwnPass123' })

      expect(res.status).toBe(200)
      expect(await bcrypt.compare('NewOwnPass1', farmer.password)).toBe(true)
    })

    test('cannot change their own roles or status', async () => {
      const res = await put('u-farmer', { name: 'Fern', roles: ['Admin'], isActive: false })

      expect(res.status).toBe(200)
      expect(farmer.roles).toEqual(['Farmer'])
      expect(farmer.isActive).toBe(true)
    })
  })
})
