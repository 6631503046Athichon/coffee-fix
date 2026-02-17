/**
 * Phase 1 Security Fix: Registration Lock-Down Tests
 * Tests for admin-only user registration
 */

import { describe, test, expect, jest } from '@jest/globals'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockPrismaUser = {
  findFirst: jest.fn(),
  create: jest.fn(),
  findUnique: jest.fn(),
}

const mockPrisma = {
  user: mockPrismaUser,
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Mock auth functions
const mockRequireAuth = jest.fn()
const mockRequireRole = jest.fn()

jest.mock('@/lib/middleware', () => ({
  requireAuth: mockRequireAuth,
  requireRole: mockRequireRole,
  handleApiError: jest.fn((error: any) => {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message === 'Unauthorized' ? 401 : error.message === 'Insufficient permissions' ? 403 : 500
    })
  }),
}))

jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn(async (pwd: string) => `hashed_${pwd}`),
  generateToken: jest.fn(() => 'mock_token'),
}))

describe('Registration Lock-Down', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should fail registration for unauthenticated users (401)', async () => {
    // Mock unauthenticated request
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'))

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(mockRequireAuth).toHaveBeenCalled()
  })

  test('should fail registration for non-admin users (403)', async () => {
    // Mock authenticated user without admin role
    mockRequireAuth.mockResolvedValueOnce({
      id: 'user-123',
      name: 'Regular User',
      roles: ['Farmer'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {
      throw new Error('Insufficient permissions')
    })

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Insufficient permissions')
    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockRequireRole).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['Farmer'] }),
      ['Admin']
    )
  })

  test('should succeed registration for admin users', async () => {
    // Mock admin user
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {}) // No error means success

    // Mock no existing user
    mockPrismaUser.findFirst.mockResolvedValueOnce(null)

    // Mock user creation
    mockPrismaUser.create.mockResolvedValueOnce({
      id: 'new-user-123',
      email: 'test@example.com',
      username: null,
      name: 'Test User',
      roles: ['Farmer'],
      isActive: true,
      isSuperAdmin: false,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        roles: ['Farmer'],
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.message).toBe('Registration successful')
    expect(data.user).toBeDefined()
    expect(data.user.mustChangePassword).toBe(true)
    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockRequireRole).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['Admin'] }),
      ['Admin']
    )
  })

  test('should set mustChangePassword to true for new users', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})
    mockPrismaUser.findFirst.mockResolvedValueOnce(null)

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

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        roles: ['Processor'],
      }),
    })

    await POST(request)

    expect(createdUserData).toBeDefined()
    expect(createdUserData.mustChangePassword).toBe(true)
  })

  test('should prevent users from setting their own roles', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})
    mockPrismaUser.findFirst.mockResolvedValueOnce(null)

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

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        roles: ['Admin', 'Processor'], // User trying to give themselves admin role
      }),
    })

    await POST(request)

    // Admin explicitly set the roles, not the user
    expect(createdUserData.roles).toEqual(['Admin', 'Processor'])
    expect(createdUserData.isSuperAdmin).toBe(false)
  })

  test('should never allow registration as super admin', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})
    mockPrismaUser.findFirst.mockResolvedValueOnce(null)

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

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        roles: ['Admin'],
      }),
    })

    await POST(request)

    expect(createdUserData.isSuperAdmin).toBe(false)
  })

  test('should require minimum password length', async () => {
    mockRequireAuth.mockResolvedValueOnce({
      id: 'admin-123',
      name: 'Admin User',
      roles: ['Admin'],
      isActive: true,
      isSuperAdmin: false,
    })
    mockRequireRole.mockImplementationOnce(() => {})

    const { POST } = await import('@/app/api/auth/register/route')

    const request = new NextRequest('http://localhost:3001/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'short', // Less than 6 characters
        name: 'Test User',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Password must be at least 6 characters')
  })
})
