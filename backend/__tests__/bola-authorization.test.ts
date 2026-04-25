/**
 * Phase 1 Security Fix: BOLA (Broken Object Level Authorization) Tests
 * Tests for proper authorization checks on protected routes
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockPrisma: any = {
  greenBeanLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  greenBeanWithdrawal: {
    create: jest.fn(),
  },
  processingBatch: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  dryingLogEntry: {
    deleteMany: jest.fn(),
  },
  parchmentLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  physicalTestResults: {
    deleteMany: jest.fn(),
  },
  cuppingSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  cuppingSample: {
    create: jest.fn(),
  },
  cuppingSessionJudge: {
    create: jest.fn(),
  },
  harvestLot: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => {
    return await callback(mockPrisma)
  }),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

// Mock middleware
let mockAuthUser: any = null
let mockAuthError: Error | null = null

const mockRequireAuth = jest.fn(async () => {
  if (mockAuthError) throw mockAuthError
  if (!mockAuthUser) throw new Error('Unauthorized')
  return mockAuthUser
})

const mockRequireRole = jest.fn((user: any, roles: string[]) => {
  const hasRole = user.roles.some((role: string) => roles.includes(role))
  if (!hasRole && !user.isSuperAdmin) {
    throw new Error('Insufficient permissions')
  }
})

const mockRequireOwnership = jest.fn(
  (user: any, ownerId: string | null, allowedRoles: string[] = ['Admin']) => {
    if (user.isSuperAdmin) return
    const hasAllowedRole = user.roles.some((role: string) => allowedRoles.includes(role))
    if (hasAllowedRole) return
    if (!ownerId || user.id !== ownerId) {
      throw new Error('Insufficient permissions')
    }
  },
)

const mockHandleApiError = jest.fn((error: any) => {
  const status =
    error.message === 'Unauthorized'
      ? 401
      : error.message === 'Insufficient permissions'
        ? 403
        : 500
  return new Response(JSON.stringify({ error: error.message }), { status })
})

jest.mock('@/lib/middleware', () => ({
  requireAuth: mockRequireAuth,
  requireRole: mockRequireRole,
  requireOwnership: mockRequireOwnership,
  handleApiError: mockHandleApiError,
}))

jest.mock('@/lib/utils', () => ({
  safeParseFloat: jest.fn((val: any) => {
    const parsed = parseFloat(val)
    return isNaN(parsed) ? null : parsed
  }),
}))

describe('BOLA Authorization Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthUser = null
    mockAuthError = null
  })

  describe('PUT /api/green-bean-lots/[id] - Update Green Bean Lot', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ grade: 'A' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    test('should return 403 for wrong role (Farmer)', async () => {
      mockAuthUser = {
        id: 'farmer-123',
        name: 'Farmer User',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ grade: 'A' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Admin'])
    })

    test('should succeed for Processor role', async () => {
      mockAuthUser = {
        id: 'processor-123',
        name: 'Processor User',
        roles: ['Processor'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        currentWeightKg: 100,
        availabilityStatus: 'Available',
      })

      mockPrisma.greenBeanLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        grade: 'A',
        currentWeightKg: 100,
        parchmentLot: {},
        priceSetter: null,
      })

      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ grade: 'A' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
      expect(mockRequireAuth).toHaveBeenCalled()
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Admin'])
    })

    test('should succeed for Admin role', async () => {
      mockAuthUser = {
        id: 'admin-123',
        name: 'Admin User',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        currentWeightKg: 100,
        availabilityStatus: 'Available',
      })

      mockPrisma.greenBeanLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        grade: 'A',
        parchmentLot: {},
        priceSetter: null,
      })

      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ grade: 'A' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
    })
  })

  describe('DELETE /api/green-bean-lots/[id] - Delete Green Bean Lot', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { DELETE } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123', {
        method: 'DELETE',
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await DELETE(request, { params })

      expect(response.status).toBe(401)
    })

    test('should return 403 for wrong role', async () => {
      mockAuthUser = {
        id: 'roaster-123',
        roles: ['Roaster'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { DELETE } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123')

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await DELETE(request, { params })

      expect(response.status).toBe(403)
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Admin'])
    })
  })

  describe('POST /api/green-bean-lots/[id]/withdrawals - Create Withdrawal', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')

      const request = new NextRequest(
        'http://localhost:3001/api/green-bean-lots/lot-123/withdrawals',
        {
          method: 'POST',
          body: JSON.stringify({ amountKg: 10, withdrawalType: 'Sale', purpose: 'Customer Order' }),
        },
      )

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await POST(request, { params })

      expect(response.status).toBe(401)
    })

    test('should return 403 for wrong role (Farmer)', async () => {
      mockAuthUser = {
        id: 'farmer-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')

      const request = new NextRequest(
        'http://localhost:3001/api/green-bean-lots/lot-123/withdrawals',
        {
          method: 'POST',
          body: JSON.stringify({ amountKg: 10, withdrawalType: 'Sale', purpose: 'Customer Order' }),
        },
      )

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await POST(request, { params })

      expect(response.status).toBe(403)
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Roaster', 'Admin'])
    })

    test('should succeed for Roaster role', async () => {
      mockAuthUser = {
        id: 'roaster-123',
        name: 'Roaster User',
        roles: ['Roaster'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        currentWeightKg: 100,
      })

      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        currentWeightKg: 90,
        withdrawalHistory: [],
      })

      const { POST } = await import('@/app/api/green-bean-lots/[id]/withdrawals/route')

      const request = new NextRequest(
        'http://localhost:3001/api/green-bean-lots/lot-123/withdrawals',
        {
          method: 'POST',
          body: JSON.stringify({ amountKg: 10, withdrawalType: 'Sale', purpose: 'Customer Order' }),
        },
      )

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await POST(request, { params })

      expect(response.status).toBe(201)
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Roaster', 'Admin'])
    })
  })

  describe('PUT /api/processing-batches/[id] - Update Processing Batch', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { PUT } = await import('@/app/api/processing-batches/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/processing-batches/batch-123', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Completed' }),
      })

      const params = Promise.resolve({ id: 'batch-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(401)
    })

    test('should return 403 for wrong role', async () => {
      mockAuthUser = {
        id: 'cupper-123',
        roles: ['Cupper'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { PUT } = await import('@/app/api/processing-batches/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/processing-batches/batch-123', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Completed' }),
      })

      const params = Promise.resolve({ id: 'batch-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(403)
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Admin'])
    })

    test('should succeed for Processor role', async () => {
      mockAuthUser = {
        id: 'processor-123',
        roles: ['Processor'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.processingBatch.update.mockResolvedValueOnce({
        id: 'batch-123',
        status: 'Completed',
        harvestLot: {},
        cropYear: {},
        dryingLogs: [],
        parchmentLots: [],
      })

      const { PUT } = await import('@/app/api/processing-batches/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/processing-batches/batch-123', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Completed' }),
      })

      const params = Promise.resolve({ id: 'batch-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
    })
  })

  describe('DELETE /api/processing-batches/[id] - Delete Processing Batch', () => {
    test('should return 403 for wrong role', async () => {
      mockAuthUser = {
        id: 'farmer-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { DELETE } = await import('@/app/api/processing-batches/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/processing-batches/batch-123')

      const params = Promise.resolve({ id: 'batch-123' })
      const response = await DELETE(request, { params })

      expect(response.status).toBe(403)
    })
  })

  describe('PATCH /api/parchment-lots/[id] - Update Parchment Lot', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { PATCH } = await import('@/app/api/parchment-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/parchment-lots/lot-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Ready' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(401)
    })

    test('should return 403 for wrong role', async () => {
      mockAuthUser = {
        id: 'roaster-123',
        roles: ['Roaster'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { PATCH } = await import('@/app/api/parchment-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/parchment-lots/lot-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Ready' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(403)
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['Processor', 'Admin'])
    })

    test('should succeed for Admin role', async () => {
      mockAuthUser = {
        id: 'admin-123',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.parchmentLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        status: 'Ready',
        processingBatch: { harvestLot: {} },
      })

      const { PATCH } = await import('@/app/api/parchment-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/parchment-lots/lot-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Ready' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PATCH(request, { params })

      expect(response.status).toBe(200)
    })
  })

  describe('DELETE /api/parchment-lots/[id] - Delete Parchment Lot', () => {
    test('should return 403 for wrong role', async () => {
      mockAuthUser = {
        id: 'cupper-123',
        roles: ['Cupper'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { DELETE } = await import('@/app/api/parchment-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/parchment-lots/lot-123')

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await DELETE(request, { params })

      expect(response.status).toBe(403)
    })
  })

  describe('POST /api/cupping-sessions - Create Cupping Session', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { POST } = await import('@/app/api/cupping-sessions/route')

      const request = new NextRequest('http://localhost:3001/api/cupping-sessions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Session 1', type: 'Standard' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    test('should return 403 for wrong role (Farmer)', async () => {
      mockAuthUser = {
        id: 'farmer-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      const { POST } = await import('@/app/api/cupping-sessions/route')

      const request = new NextRequest('http://localhost:3001/api/cupping-sessions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Session 1', type: 'Standard' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(403)
      expect(mockRequireRole).toHaveBeenCalledWith(mockAuthUser, ['HeadJudge', 'Cupper', 'Admin'])
    })

    test('should succeed for HeadJudge role', async () => {
      mockAuthUser = {
        id: 'judge-123',
        name: 'Judge User',
        roles: ['HeadJudge'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.cuppingSession.create.mockResolvedValueOnce({
        id: 'session-123',
        name: 'Session 1',
        type: 'Standard',
        createdBy: 'judge-123',
      })

      mockPrisma.cuppingSession.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        name: 'Session 1',
        type: 'Standard',
        creator: { id: 'judge-123', name: 'Judge User' },
        samples: [],
        judges: [],
      })

      const { POST } = await import('@/app/api/cupping-sessions/route')

      const request = new NextRequest('http://localhost:3001/api/cupping-sessions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Session 1', type: 'Standard' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    test('should succeed for Cupper role', async () => {
      mockAuthUser = {
        id: 'cupper-123',
        name: 'Cupper User',
        roles: ['Cupper'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.cuppingSession.create.mockResolvedValueOnce({
        id: 'session-123',
        name: 'Session 1',
        type: 'Standard',
      })

      mockPrisma.cuppingSession.findUnique.mockResolvedValueOnce({
        id: 'session-123',
        creator: {},
        samples: [],
        judges: [],
      })

      const { POST } = await import('@/app/api/cupping-sessions/route')

      const request = new NextRequest('http://localhost:3001/api/cupping-sessions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Session 1', type: 'Standard' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })
  })

  describe('PUT /api/harvest-lots/[id] - Update Harvest Lot (Ownership)', () => {
    test('should return 401 for unauthenticated access', async () => {
      mockAuthError = new Error('Unauthorized')

      const { PUT } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ weightKg: 200 }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(401)
    })

    test('should return 403 for non-owner Farmer', async () => {
      mockAuthUser = {
        id: 'farmer-456',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        createdById: 'farmer-123', // Different farmer
      })

      const { PUT } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ weightKg: 200 }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(403)
      expect(mockRequireOwnership).toHaveBeenCalledWith(mockAuthUser, 'farmer-123', ['Admin'])
    })

    test('should succeed for owner Farmer', async () => {
      mockAuthUser = {
        id: 'farmer-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        createdById: 'farmer-123', // Same farmer
      })

      mockPrisma.harvestLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        weightKg: 200,
        farm: {},
        cropYear: {},
      })

      const { PUT } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ weightKg: 200 }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
      expect(mockRequireOwnership).toHaveBeenCalledWith(mockAuthUser, 'farmer-123', ['Admin'])
    })

    test('should succeed for Admin regardless of ownership', async () => {
      mockAuthUser = {
        id: 'admin-123',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        createdById: 'farmer-123', // Different user
      })

      mockPrisma.harvestLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        weightKg: 200,
        farm: {},
        cropYear: {},
      })

      const { PUT } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ weightKg: 200 }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
    })
  })

  describe('DELETE /api/harvest-lots/[id] - Delete Harvest Lot (Ownership)', () => {
    test('should return 403 for non-owner', async () => {
      mockAuthUser = {
        id: 'farmer-456',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        createdById: 'farmer-123',
      })

      const { DELETE } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123')

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await DELETE(request, { params })

      expect(response.status).toBe(403)
    })

    test('should succeed for owner', async () => {
      mockAuthUser = {
        id: 'farmer-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      }

      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        createdById: 'farmer-123',
      })

      mockPrisma.harvestLot.delete.mockResolvedValueOnce({})

      const { DELETE } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123')

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await DELETE(request, { params })

      expect(response.status).toBe(200)
    })
  })

  describe('Admin Bypass Tests', () => {
    test('should allow Admin to bypass all role checks', async () => {
      mockAuthUser = {
        id: 'admin-123',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: false,
      }

      // Test on a route that requires specific role
      mockPrisma.greenBeanLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        currentWeightKg: 100,
        availabilityStatus: 'Available',
      })

      mockPrisma.greenBeanLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        parchmentLot: {},
        priceSetter: null,
      })

      const { PUT } = await import('@/app/api/green-bean-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/green-bean-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ grade: 'A' }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
      expect(mockRequireRole).toHaveBeenCalled()
    })

    test('should allow SuperAdmin to bypass ownership checks', async () => {
      mockAuthUser = {
        id: 'superadmin-123',
        roles: ['Admin'],
        isActive: true,
        isSuperAdmin: true,
      }

      mockPrisma.harvestLot.findUnique.mockResolvedValueOnce({
        id: 'lot-123',
        createdById: 'farmer-123', // Different user
      })

      mockPrisma.harvestLot.update.mockResolvedValueOnce({
        id: 'lot-123',
        farm: {},
        cropYear: {},
      })

      const { PUT } = await import('@/app/api/harvest-lots/[id]/route')

      const request = new NextRequest('http://localhost:3001/api/harvest-lots/lot-123', {
        method: 'PUT',
        body: JSON.stringify({ weightKg: 200 }),
      })

      const params = Promise.resolve({ id: 'lot-123' })
      const response = await PUT(request, { params })

      expect(response.status).toBe(200)
      expect(mockRequireOwnership).toHaveBeenCalled()
    })
  })
})
