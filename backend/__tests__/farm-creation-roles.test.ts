/**
 * Farm Creation Role-Based Authorization Tests
 *
 * Comprehensive tests to verify farm creation permissions work correctly for all user roles:
 * - Farmer: Can create farms for themselves only
 * - Admin: Can create farms for anyone
 * - SuperAdmin: Bypasses all role checks
 * - Processor, Roaster, HeadJudge, Cupper: Cannot create farms (403 Forbidden)
 *
 * Also tests edge cases like unauthenticated requests, multiple roles, and invalid ownerId.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

describe('Farm Creation Role-Based Authorization', () => {
  const mockPrisma = {
    farm: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  }

  const mockRequireAuth = jest.fn()
  const mockRequireRole = jest.fn()
  const mockHandleApiError = jest.fn((error: any) => {
    const status =
      error.message === 'Unauthorized' || error.message === 'Invalid or expired token' ? 401 :
      error.message === 'Insufficient permissions' ? 403 :
      error.message === 'User not found or inactive' ? 401 :
      400
    return new Response(JSON.stringify({ error: error.message }), { status })
  })

  jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: mockPrisma,
  }))

  jest.mock('@/lib/middleware', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
    handleApiError: mockHandleApiError,
  }))

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Helper function to create valid farm request data
  const createValidFarmData = (overrides = {}) => ({
    farmName: 'Test Farm',
    location: 'Chiang Rai, Thailand',
    latitude: 20.0836,
    longitude: 99.8325,
    sizeHectares: 10,
    googleMapsUrl: '',
    ...overrides,
  })

  // Valid UUID constants for testing
  const FARMER_ID_1 = '550e8400-e29b-41d4-a716-446655440001'
  const FARMER_ID_2 = '550e8400-e29b-41d4-a716-446655440002'
  const ADMIN_ID_1 = '550e8400-e29b-41d4-a716-446655440011'
  const ADMIN_ID_2 = '550e8400-e29b-41d4-a716-446655440012'
  const OTHER_USER_ID = '550e8400-e29b-41d4-a716-446655440099'
  const PROCESSOR_ID = '550e8400-e29b-41d4-a716-446655440021'
  const ROASTER_ID = '550e8400-e29b-41d4-a716-446655440022'
  const HEADJUDGE_ID = '550e8400-e29b-41d4-a716-446655440023'
  const CUPPER_ID = '550e8400-e29b-41d4-a716-446655440024'
  const SUPERADMIN_ID_1 = '550e8400-e29b-41d4-a716-446655440031'
  const SUPERADMIN_ID_2 = '550e8400-e29b-41d4-a716-446655440032'
  const MULTI_ROLE_ID = '550e8400-e29b-41d4-a716-446655440041'
  const ADMIN_MULTI_ID = '550e8400-e29b-41d4-a716-446655440042'
  const TARGET_USER_ID = '550e8400-e29b-41d4-a716-446655440051'
  const INVALID_USER_ID = '550e8400-e29b-41d4-a716-446655449999'

  describe('Farmer Role Tests', () => {
    test('should allow Farmer to create farm for themselves (ownerId = their ID)', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: FARMER_ID_1,
        name: 'Test Farmer',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-123',
        farmName: 'Test Farm',
        location: 'Chiang Rai, Thailand',
        ownerId: FARMER_ID_1,
        owner: {
          id: FARMER_ID_1,
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData(),
          ownerId: FARMER_ID_1,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(data.farm.ownerId).toBe(FARMER_ID_1)
      expect(mockPrisma.farm.create).toHaveBeenCalled()
    })

    test('should allow Farmer to create farm for themselves (ownerId omitted)', async () => {
      const farmerId = FARMER_ID_2

      mockRequireAuth.mockResolvedValueOnce({
        id: farmerId,
        name: 'Test Farmer',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-456',
        farmName: 'Test Farm',
        location: 'Chiang Rai, Thailand',
        ownerId: farmerId,
        owner: {
          id: farmerId,
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: farmerId,
          }),
        })
      )
    })

    test('should reject Farmer creating farm for another user (403 Forbidden)', async () => {
      const farmerId = FARMER_ID_1
      const otherUserId = OTHER_USER_ID

      mockRequireAuth.mockResolvedValueOnce({
        id: farmerId,
        name: 'Test Farmer',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData(),
          ownerId: otherUserId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should still validate farm data for Farmer (missing required fields)', async () => {
      const farmerId = FARMER_ID_1

      mockRequireAuth.mockResolvedValueOnce({
        id: farmerId,
        name: 'Test Farmer',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required fields: farmName, location
          latitude: 20.0836,
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })
  })

  describe('Admin Role Tests', () => {
    test('should allow Admin to create farm for themselves', async () => {
      const adminId = ADMIN_ID_1

      mockRequireAuth.mockResolvedValueOnce({
        id: adminId,
        name: 'Test Admin',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-admin-123',
        farmName: 'Admin Farm',
        location: 'Bangkok, Thailand',
        ownerId: adminId,
        owner: {
          id: adminId,
          name: 'Test Admin',
          email: 'admin@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData({ farmName: 'Admin Farm' })),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: adminId,
          }),
        })
      )
    })

    test('should allow Admin to create farm for any other user (by specifying ownerId)', async () => {
      const adminId = ADMIN_ID_1
      const targetUserId = TARGET_USER_ID

      mockRequireAuth.mockResolvedValueOnce({
        id: adminId,
        name: 'Test Admin',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-999',
        farmName: 'Farm for Another User',
        location: 'Chiang Mai, Thailand',
        ownerId: targetUserId,
        owner: {
          id: targetUserId,
          name: 'Target Farmer',
          email: 'target@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData({ farmName: 'Farm for Another User' }),
          ownerId: targetUserId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(data.farm.ownerId).toBe(targetUserId)
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: targetUserId,
          }),
        })
      )
    })

    test('should allow Admin to create farm with ownerId omitted (defaults to their own ID)', async () => {
      const adminId = ADMIN_ID_2

      mockRequireAuth.mockResolvedValueOnce({
        id: adminId,
        name: 'Test Admin',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-admin-456',
        farmName: 'Test Farm',
        location: 'Test Location',
        ownerId: adminId,
        owner: {
          id: adminId,
          name: 'Test Admin',
          email: 'admin@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: adminId,
          }),
        })
      )
    })

    test('should still validate farm data for Admin (invalid googleMapsUrl)', async () => {
      const adminId = ADMIN_ID_1

      mockRequireAuth.mockResolvedValueOnce({
        id: adminId,
        name: 'Test Admin',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData(),
          googleMapsUrl: 'not-a-valid-url',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })
  })

  describe('Unauthorized Roles Tests (Processor, Roaster, HeadJudge, Cupper)', () => {
    test('should reject Processor role from creating farms (403 Forbidden)', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: PROCESSOR_ID,
        name: 'Test Processor',
        roles: ['Processor'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {
        throw new Error('Insufficient permissions')
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject Roaster role from creating farms (403 Forbidden)', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: ROASTER_ID,
        name: 'Test Roaster',
        roles: ['Roaster'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {
        throw new Error('Insufficient permissions')
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject HeadJudge role from creating farms (403 Forbidden)', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: HEADJUDGE_ID,
        name: 'Test Judge',
        roles: ['HeadJudge'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {
        throw new Error('Insufficient permissions')
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject Cupper role from creating farms (403 Forbidden)', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: CUPPER_ID,
        name: 'Test Cupper',
        roles: ['Cupper'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {
        throw new Error('Insufficient permissions')
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })
  })

  describe('SuperAdmin Tests', () => {
    test('should allow SuperAdmin to create farms regardless of role array', async () => {
      const superAdminId = SUPERADMIN_ID_1

      mockRequireAuth.mockResolvedValueOnce({
        id: superAdminId,
        name: 'Super Admin',
        roles: [], // Empty roles array
        isActive: true,
        isSuperAdmin: true, // SuperAdmin flag set
      })
      mockRequireRole.mockImplementationOnce(() => {}) // SuperAdmin bypasses role checks

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-super-123',
        farmName: 'SuperAdmin Farm',
        location: 'Anywhere, Thailand',
        ownerId: superAdminId,
        owner: {
          id: superAdminId,
          name: 'Super Admin',
          email: 'superadmin@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData({ farmName: 'SuperAdmin Farm' })),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(data.farm.ownerId).toBe(superAdminId)
    })

    test('should allow SuperAdmin to create farm with Admin role (bypass ownership checks)', async () => {
      const superAdminId = SUPERADMIN_ID_2
      const targetUserId = TARGET_USER_ID

      mockRequireAuth.mockResolvedValueOnce({
        id: superAdminId,
        name: 'Super Admin',
        roles: ['Admin'], // SuperAdmin with Admin role to pass requireRole check
        isActive: true,
        isSuperAdmin: true,
      })
      mockRequireRole.mockImplementationOnce(() => {}) // SuperAdmin bypasses

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-789',
        farmName: 'SuperAdmin Farm 2',
        location: 'Phuket, Thailand',
        ownerId: targetUserId,
        owner: {
          id: targetUserId,
          name: 'Random User',
          email: 'random@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData({ farmName: 'SuperAdmin Farm 2' }),
          ownerId: targetUserId,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(data.farm.ownerId).toBe(targetUserId)
    })
  })

  describe('Edge Cases', () => {
    test('should reject unauthenticated request (401 Unauthorized)', async () => {
      mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'))

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should allow user with multiple roles including Farmer', async () => {
      const userId = MULTI_ROLE_ID

      mockRequireAuth.mockResolvedValueOnce({
        id: userId,
        name: 'Multi Role User',
        roles: ['Farmer', 'Processor'], // Has both Farmer and Processor roles
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {}) // Farmer role allows this

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-multi-123',
        farmName: 'Multi Role Farm',
        location: 'Test Location',
        ownerId: userId,
        owner: {
          id: userId,
          name: 'Multi Role User',
          email: 'multi@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData({ farmName: 'Multi Role Farm' })),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
    })

    test('should allow user with multiple roles including Admin to create for themselves', async () => {
      const userId = ADMIN_MULTI_ID

      mockRequireAuth.mockResolvedValueOnce({
        id: userId,
        name: 'Admin Multi Role',
        roles: ['Admin', 'Cupper'], // Has both Admin and Cupper roles
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {}) // Admin role allows this

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-admin-multi-123',
        farmName: 'Admin Multi Farm',
        location: 'Test Location',
        ownerId: ADMIN_MULTI_ID,  // Create for themselves
        owner: {
          id: ADMIN_MULTI_ID,
          name: 'Admin Multi Role',
          email: 'adminmulti@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData({ farmName: 'Admin Multi Farm' }),
          // ownerId omitted - should default to userId
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      // Should create farm for themselves when ownerId omitted
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: ADMIN_MULTI_ID,
          }),
        })
      )
    })

    test('should validate ownerId format (invalid UUID)', async () => {
      const adminId = ADMIN_ID_1

      mockRequireAuth.mockResolvedValueOnce({
        id: adminId,
        name: 'Test Admin',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          ...createValidFarmData(),
          ownerId: 'not-a-valid-uuid', // Invalid UUID format
        }),
      })

      const response = await POST(request)

      // Should fail validation before reaching Prisma
      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject inactive user (401 Unauthorized)', async () => {
      mockRequireAuth.mockRejectedValueOnce(new Error('User not found or inactive'))

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('User not found or inactive')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject expired token (401 Unauthorized)', async () => {
      mockRequireAuth.mockRejectedValueOnce(new Error('Invalid or expired token'))

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify(createValidFarmData()),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Invalid or expired token')
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })
  })
})
