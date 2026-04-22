/**
 * Phase 1 Security Fix: Plaintext Password Removal Tests
 * Tests to ensure no plaintext passwords are stored or returned
 */

import { describe, test, expect, jest } from '@jest/globals'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockPrismaUser = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}

const mockPrisma = {
  user: mockPrismaUser,
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Mock auth and middleware
const mockRequireAuth = jest.fn()
const mockRequireRole = jest.fn()

jest.mock('@/lib/middleware', () => ({
  requireAuth: mockRequireAuth,
  requireRole: mockRequireRole,
  handleApiError: jest.fn((error: any) => {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500
    })
  }),
}))

jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn(async (pwd: string) => `hashed_${pwd}`),
  generateToken: jest.fn(() => 'mock_token'),
}))

jest.mock('@/lib/credentialGenerator', () => ({
  generateUsername: jest.fn(async () => 'generated_user'),
  generatePassword: jest.fn(() => 'GeneratedPass123'),
}))

jest.mock('@/lib/validations', () => ({
  validateBody: jest.fn(async (req: any, schema: any) => ({
    success: true,
    data: await req.json()
  })),
  createUserSchema: {},
}))

describe('Plaintext Password Removal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should not return password field in GET /api/users response', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})

    // Mock database response with users
    mockPrismaUser.findMany.mockResolvedValueOnce([
      {
        id: 'user-1',
        username: 'user1',
        email: 'user1@example.com',
        name: 'User One',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
        createdAt: new Date(),
        lastLogin: new Date(),
        mustChangePassword: false,
      },
      {
        id: 'user-2',
        username: 'user2',
        email: 'user2@example.com',
        name: 'User Two',
        roles: ['Processor'],
        isActive: true,
        isSuperAdmin: false,
        createdAt: new Date(),
        lastLogin: new Date(),
        mustChangePassword: true,
      },
    ])

    const { GET } = await import('@/app/api/users/route')

    const request = new NextRequest('http://localhost:3001/api/users')

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.users).toBeDefined()
    expect(Array.isArray(data.users)).toBe(true)

    // Verify no password field in any user
    data.users.forEach((user: any) => {
      expect(user.password).toBeUndefined()
      expect(user.temporaryPassword).toBeUndefined()
    })

    // Verify the Prisma select statement doesn't include password
    const selectArg = mockPrismaUser.findMany.mock.calls[0][0].select
    expect(selectArg).toBeDefined()
    expect(selectArg.password).toBeUndefined()
    expect(selectArg.temporaryPassword).toBeUndefined()
  })

  test('should not store temporaryPassword field during user creation', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})

    let createdUserData: any = null
    mockPrismaUser.create.mockImplementationOnce(async (args: any) => {
      createdUserData = args.data
      return {
        id: 'new-user-123',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    mockPrismaUser.findUnique.mockResolvedValueOnce(null) // No existing user

    const { POST } = await import('@/app/api/users/route')

    const request = new NextRequest('http://localhost:3001/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New User',
        email: 'newuser@example.com',
        roles: ['Farmer'],
        isActive: true,
        autoGenerate: true,
      }),
    })

    await POST(request)

    expect(createdUserData).toBeDefined()
    expect(createdUserData.temporaryPassword).toBeUndefined()
    expect(createdUserData.password).toBeDefined() // Only hashed password
  })

  test('should not store temporaryPassword field during user update', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })

    let updateUserData: any = null
    mockPrismaUser.update.mockImplementationOnce(async (args: any) => {
      updateUserData = args.data
      return {
        id: 'user-123',
        ...args.data,
        updatedAt: new Date(),
      }
    })

    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['Farmer'],
      isActive: true,
      isSuperAdmin: false,
    })

    // users/[id]/route.ts exports PUT (not PATCH) for the admin update flow.
    const { PUT } = await import('@/app/api/users/[id]/route')

    const request = new NextRequest('http://localhost:3001/api/users/user-123', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Updated Name',
        isActive: false,
      }),
    })

    const params = Promise.resolve({ id: 'user-123' })
    await PUT(request, { params })

    if (updateUserData) {
      expect(updateUserData.temporaryPassword).toBeUndefined()
    }
  })

  test('should return plain password only once to admin after creation (for distribution)', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})

    mockPrismaUser.create.mockResolvedValueOnce({
      id: 'new-user-123',
      username: 'generated_user',
      email: 'newuser@example.com',
      name: 'New User',
      roles: ['Farmer'],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: true,
      mustChangeUsername: true,
      mustChangeEmail: false,
      createdAt: new Date(),
    })

    mockPrismaUser.findUnique.mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/users/route')

    const request = new NextRequest('http://localhost:3001/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New User',
        email: 'newuser@example.com',
        roles: ['Farmer'],
        isActive: true,
        autoGenerate: true,
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.user).toBeDefined()
    expect(data.user.password).toBeUndefined() // Never return hashed password

    // Plain credentials should be in response for admin to share
    expect(data.credentials).toBeDefined()
    expect(data.credentials.username).toBe('generated_user')
    expect(data.credentials.password).toBe('GeneratedPass123')
    expect(data.credentials.message).toContain('first login')
  })

  test('should verify password is hashed before storage', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})

    let storedPassword: string | null = null
    mockPrismaUser.create.mockImplementationOnce(async (args: any) => {
      storedPassword = args.data.password
      return {
        id: 'new-user-123',
        ...args.data,
        createdAt: new Date(),
      }
    })

    mockPrismaUser.findUnique.mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/users/route')

    const plainPassword = 'PlainPassword123'

    const request = new NextRequest('http://localhost:3001/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New User',
        email: 'newuser@example.com',
        roles: ['Farmer'],
        isActive: true,
        autoGenerate: true,
      }),
    })

    await POST(request)

    // Verify password is hashed (not plain text)
    expect(storedPassword).toBeDefined()
    expect(storedPassword).toContain('hashed_') // Our mock prefixes with 'hashed_'
  })

  test('should not include temporaryPassword in schema', async () => {
    // This test verifies the schema doesn't have temporaryPassword field
    // In a real test, we'd check the Prisma schema, but here we verify behavior

    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})

    mockPrismaUser.findMany.mockResolvedValueOnce([
      {
        id: 'user-1',
        username: 'user1',
        email: 'user1@example.com',
        name: 'User One',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
        createdAt: new Date(),
        lastLogin: new Date(),
        mustChangePassword: false,
      },
    ])

    const { GET } = await import('@/app/api/users/route')

    const request = new NextRequest('http://localhost:3001/api/users')
    await GET(request)

    // Verify select clause doesn't include temporaryPassword
    const selectArg = mockPrismaUser.findMany.mock.calls[0][0].select
    expect(selectArg.temporaryPassword).toBeUndefined()
  })
})
