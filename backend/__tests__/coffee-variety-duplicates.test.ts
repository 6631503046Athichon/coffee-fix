/**
 * Coffee variety names are unique ignoring case and surrounding spaces.
 * The database index on CoffeeVariety.name is case-sensitive, so on prod
 * POST /api/coffee-varieties accepted "bourbon" next to "Bourbon" (201).
 * POST and a renaming PUT now answer 409 naming the variety that holds it.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

type Row = Record<string, any>
let mockVarieties: Row[] = []

const mockPrisma: any = {
  coffeeVariety: {
    findMany: jest.fn(async () => mockVarieties.map(v => ({ id: v.id, name: v.name }))),
    findUnique: jest.fn(async ({ where }: any) => {
      const row = mockVarieties.find(v => (where.id ? v.id === where.id : v.name === where.name))
      return row ? { ...row } : null
    }),
    create: jest.fn(async ({ data }: any) => {
      // Mirrors the case-sensitive unique index
      if (mockVarieties.some(v => v.name === data.name)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      }
      const row = { id: `v-${mockVarieties.length + 1}`, ...data }
      mockVarieties.push(row)
      return { ...row }
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = mockVarieties.find(v => v.id === where.id)
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' })
      Object.assign(row, data)
      return { ...row }
    }),
  },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

let mockAuthUser: any = null

jest.mock('@/lib/middleware', () => ({
  requireAuth: jest.fn(async () => {
    if (!mockAuthUser) throw new Error('Unauthorized')
    return mockAuthUser
  }),
  requireRole: jest.fn((user: any, roles: string[]) => {
    if (!user.isSuperAdmin && !user.roles.some((role: string) => roles.includes(role))) {
      throw new Error('Insufficient permissions')
    }
  }),
  handleApiError: jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized'
        ? 401
        : error.message === 'Insufficient permissions'
          ? 403
          : error.code === 'P2002'
            ? 409
            : error.code === 'P2025'
              ? 404
              : 500
    return new Response(JSON.stringify({ error: error.message }), { status })
  }),
}))

const admin = { id: 'admin-1', roles: ['Admin'], isSuperAdmin: false }

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/coffee-varieties/route')
  return POST(
    new NextRequest('http://localhost:3001/api/coffee-varieties', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )
}

const put = async (id: string, body: unknown) => {
  const { PUT } = await import('@/app/api/coffee-varieties/[id]/route')
  return PUT(
    new NextRequest(`http://localhost:3001/api/coffee-varieties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
}

const variety = (id: string, name: string): Row => ({
  id,
  name,
  species: 'Arabica',
  origin: null,
  description: null,
  characteristics: null,
  altitude: null,
  isActive: true,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = admin
  mockVarieties = [variety('v-bourbon', 'Bourbon'), variety('v-typica', 'Typica')]
})

describe('POST /api/coffee-varieties duplicate names', () => {
  test.each(['bourbon', 'BOURBON', '  Bourbon  ', ' bOuRbOn'])(
    'rejects %p with 409 while "Bourbon" exists',
    async name => {
      const res = await post({ name, species: 'Arabica' })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Coffee variety "Bourbon" already exists/)
      expect(mockPrisma.coffeeVariety.create).not.toHaveBeenCalled()
      expect(mockVarieties).toHaveLength(2)
    }
  )

  test('a stored name with stray spaces still counts as taken', async () => {
    mockVarieties.push(variety('v-gesha', ' Gesha '))
    const res = await post({ name: 'gesha', species: 'Arabica' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Coffee variety "Gesha" already exists/)
  })

  test('a new name is still created (201) and stored trimmed', async () => {
    const res = await post({ name: '  SL28 ', species: 'Arabica' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.coffeeVariety.name).toBe('SL28')
    expect(mockVarieties.map(v => v.name)).toContain('SL28')
  })

  test('a name that only contains another one is not a duplicate', async () => {
    const res = await post({ name: 'Yellow Bourbon', species: 'Arabica' })
    expect(res.status).toBe(201)
  })
})

describe('PUT /api/coffee-varieties/:id duplicate names', () => {
  test('renaming to another variety\'s name in a different case is 409', async () => {
    const res = await put('v-typica', { name: 'bourbon' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Coffee variety "Bourbon" already exists/)
    expect(mockPrisma.coffeeVariety.update).not.toHaveBeenCalled()
    expect(mockVarieties.find(v => v.id === 'v-typica')!.name).toBe('Typica')
  })

  test('renaming with surrounding spaces is trimmed before the check', async () => {
    const res = await put('v-typica', { name: '  BOURBON ' })
    expect(res.status).toBe(409)
  })

  test('changing only the case of its own name is allowed', async () => {
    const res = await put('v-bourbon', { name: 'BOURBON' })
    expect(res.status).toBe(200)
    expect(mockVarieties.find(v => v.id === 'v-bourbon')!.name).toBe('BOURBON')
  })

  test('saving without renaming is allowed even when an older case-duplicate exists', async () => {
    // A pair saved before the check: the admin must still be able to edit
    // or deactivate the extra one.
    mockVarieties.push(variety('v-bourbon-lower', 'bourbon'))
    const res = await put('v-bourbon-lower', { name: 'bourbon', isActive: false })
    expect(res.status).toBe(200)
    expect(mockVarieties.find(v => v.id === 'v-bourbon-lower')!.isActive).toBe(false)
  })

  test('saving an older name with stray spaces unchanged is not a rename', async () => {
    // " Gesha " was stored before names were trimmed, next to an older
    // case-duplicate. The form sends the name trimmed; that must not trip
    // the duplicate check against the variety's own name.
    mockVarieties.push(variety('v-gesha', ' Gesha '), variety('v-gesha-lower', 'gesha'))
    const res = await put('v-gesha', { name: 'Gesha', isActive: false })
    expect(res.status).toBe(200)
    const row = mockVarieties.find(v => v.id === 'v-gesha')!
    expect(row.isActive).toBe(false)
    expect(row.name).toBe('Gesha')
  })

  test('an older name with stray spaces still cannot be renamed onto another variety', async () => {
    mockVarieties.push(variety('v-gesha', ' Gesha '))
    const res = await put('v-gesha', { name: 'typica' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Coffee variety "Typica" already exists/)
    expect(mockPrisma.coffeeVariety.update).not.toHaveBeenCalled()
  })

  test('renaming to a free name works', async () => {
    const res = await put('v-typica', { name: 'Typica Mejorado' })
    expect(res.status).toBe(200)
    expect(mockVarieties.find(v => v.id === 'v-typica')!.name).toBe('Typica Mejorado')
  })
})
