/**
 * Phase 1 Security Fix: Token Extraction Tests
 * Tests for proper token extraction from both cookies and Authorization headers
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockPrismaUser: any = {
  findUnique: jest.fn(),
  update: jest.fn(),
}

const mockPrisma: any = {
  user: mockPrismaUser,
  $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async (pwd: string) => `hashed_${pwd}`),
}))

// We need to test the actual auth module
jest.unmock('@/lib/auth')
jest.unmock('@/lib/middleware')

describe('Token Extraction Tests', () => {
  const validToken = 'valid_jwt_token_12345'
  const userId = 'user-123'

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset modules to get fresh imports
    jest.resetModules()

    // Set valid JWT secret
    process.env.JWT_SECRET =
      'test_secret_key_with_sufficient_length_and_entropy_for_testing_1234567890'
  })

  describe('extractToken function', () => {
    test('should extract token from Authorization header (Bearer)', async () => {
      const { extractToken } = await import('@/lib/auth')

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      })

      const token = extractToken(request)

      expect(token).toBe(validToken)
    })

    test('should extract token from auth-token cookie', async () => {
      const { extractToken } = await import('@/lib/auth')

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Cookie: `auth-token=${validToken}; other-cookie=value`,
        },
      })

      const token = extractToken(request)

      expect(token).toBe(validToken)
    })

    test('should prioritize Authorization header over cookie', async () => {
      const { extractToken } = await import('@/lib/auth')

      const headerToken = 'header_token'
      const cookieToken = 'cookie_token'

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Authorization: `Bearer ${headerToken}`,
          Cookie: `auth-token=${cookieToken}`,
        },
      })

      const token = extractToken(request)

      expect(token).toBe(headerToken)
    })

    test('should return null if no token present', async () => {
      const { extractToken } = await import('@/lib/auth')

      const request = new NextRequest('http://localhost:3001/api/test')

      const token = extractToken(request)

      expect(token).toBeNull()
    })

    test('should return null for malformed Authorization header', async () => {
      const { extractToken } = await import('@/lib/auth')

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Authorization: 'InvalidFormat token',
        },
      })

      const token = extractToken(request)

      expect(token).toBeNull()
    })

    test('should handle multiple cookies correctly', async () => {
      const { extractToken } = await import('@/lib/auth')

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Cookie: `session=abc123; auth-token=${validToken}; user-pref=dark`,
        },
      })

      const token = extractToken(request)

      expect(token).toBe(validToken)
    })
  })

  describe('POST /api/auth/first-login-update - Token Extraction', () => {
    test('should work with Authorization header token', async () => {
      // Use mockResolvedValue (persistent) because the route flow calls findUnique
      // multiple times: (1) requireAuth lookup, (2) full-row lookup in handler,
      // (3) username uniqueness check, (4) email uniqueness check.
      // All four can safely return the same user object — the uniqueness checks
      // compare ids and a same-id hit is treated as "not taken".
      mockPrismaUser.findUnique.mockResolvedValue({
        id: userId,
        username: 'olduser',
        email: 'old@example.com',
        password: 'hashed_oldpassword',
        name: 'Test User',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
        mustChangePassword: true,
        mustChangeUsername: true,
        mustChangeEmail: true,
      })

      mockPrismaUser.update.mockResolvedValueOnce({
        id: userId,
        username: 'newuser',
        email: 'new@example.com',
        name: 'Test User',
        roles: ['Farmer'],
        isActive: true,
        mustChangePassword: false,
        mustChangeUsername: false,
        mustChangeEmail: false,
      })

      const { generateToken } = await import('@/lib/auth')
      const token = generateToken({ userId, roles: ['Farmer'] })

      const { POST } = await import('@/app/api/auth/first-login-update/route')

      const request = new NextRequest('http://localhost:3001/api/auth/first-login-update', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newUsername: 'newuser',
          newEmail: 'new@example.com',
          newPassword: 'newpassword123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('updated successfully')
      expect(mockPrismaUser.findUnique).toHaveBeenCalled()
    })

    test('should work with auth-token cookie', async () => {
      // See comment above re: mockResolvedValue vs mockResolvedValueOnce.
      mockPrismaUser.findUnique.mockResolvedValue({
        id: userId,
        username: 'olduser',
        email: 'old@example.com',
        password: 'hashed_oldpassword',
        name: 'Test User',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
        mustChangePassword: true,
        mustChangeUsername: false,
        mustChangeEmail: false,
      })

      mockPrismaUser.update.mockResolvedValueOnce({
        id: userId,
        username: 'olduser',
        email: 'old@example.com',
        name: 'Test User',
        roles: ['Farmer'],
        isActive: true,
        mustChangePassword: false,
        mustChangeUsername: false,
        mustChangeEmail: false,
      })

      const { generateToken } = await import('@/lib/auth')
      const token = generateToken({ userId, roles: ['Farmer'] })

      const { POST } = await import('@/app/api/auth/first-login-update/route')

      const request = new NextRequest('http://localhost:3001/api/auth/first-login-update', {
        method: 'POST',
        headers: {
          Cookie: `auth-token=${token}`,
        },
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockPrismaUser.findUnique).toHaveBeenCalled()
    })

    test('should fail without token', async () => {
      const { POST } = await import('@/app/api/auth/first-login-update/route')

      const request = new NextRequest('http://localhost:3001/api/auth/first-login-update', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('POST /api/users/transfer-ownership - Token Extraction', () => {
    test('should work with Authorization header token', async () => {
      const superAdminId = 'superadmin-123'
      const targetUserId = 'admin-456'

      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: targetUserId,
        username: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })

      const { generateToken } = await import('@/lib/auth')
      const token = generateToken({ userId: superAdminId, roles: ['Admin'] })

      const { POST } = await import('@/app/api/users/transfer-ownership/route')

      const request = new NextRequest('http://localhost:3001/api/users/transfer-ownership', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      // Should succeed (after proper auth)
      expect(mockPrismaUser.findUnique).toHaveBeenCalled()
    })

    test('should work with auth-token cookie', async () => {
      const superAdminId = 'superadmin-123'
      const targetUserId = 'admin-456'

      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: targetUserId,
        username: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })

      const { generateToken } = await import('@/lib/auth')
      const token = generateToken({ userId: superAdminId, roles: ['Admin'] })

      const { POST } = await import('@/app/api/users/transfer-ownership/route')

      const request = new NextRequest('http://localhost:3001/api/users/transfer-ownership', {
        method: 'POST',
        headers: {
          Cookie: `auth-token=${token}`,
        },
        body: JSON.stringify({
          targetUserId,
        }),
      })

      const response = await POST(request)

      expect(mockPrismaUser.findUnique).toHaveBeenCalled()
    })

    test('should fail without token', async () => {
      const { POST } = await import('@/app/api/users/transfer-ownership/route')

      const request = new NextRequest('http://localhost:3001/api/users/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: 'admin-456',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('requireAuth middleware token extraction', () => {
    test('should successfully authenticate with valid Authorization header', async () => {
      const { generateToken } = await import('@/lib/auth')
      const { requireAuth } = await import('@/lib/middleware')

      const token = generateToken({ userId, roles: ['Admin'] })

      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const user = await requireAuth(request)

      expect(user).toBeDefined()
      expect(user.id).toBe(userId)
      expect(user.roles).toContain('Admin')
    })

    test('should successfully authenticate with valid cookie token', async () => {
      const { generateToken } = await import('@/lib/auth')
      const { requireAuth } = await import('@/lib/middleware')

      const token = generateToken({ userId, roles: ['Admin'] })

      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Cookie: `auth-token=${token}`,
        },
      })

      const user = await requireAuth(request)

      expect(user).toBeDefined()
      expect(user.id).toBe(userId)
    })

    test('should fail authentication without token', async () => {
      const { requireAuth } = await import('@/lib/middleware')

      const request = new NextRequest('http://localhost:3001/api/test')

      await expect(requireAuth(request)).rejects.toThrow('Unauthorized')
    })

    test('should fail authentication with invalid token', async () => {
      const { requireAuth } = await import('@/lib/middleware')

      const request = new NextRequest('http://localhost:3001/api/test', {
        headers: {
          Authorization: 'Bearer invalid_token_here',
        },
      })

      await expect(requireAuth(request)).rejects.toThrow()
    })
  })
})
