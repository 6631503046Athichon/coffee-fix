/**
 * Farm Creation Integration Tests
 * End-to-end tests for farm creation with fixed URL and numeric validations
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

describe('Farm Creation API Integration', () => {
  const mockPrisma = {
    farm: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  }

  const mockRequireAuth = jest.fn()
  const mockRequireRole = jest.fn()
  const mockHandleApiError = jest.fn((error: any) => {
    const status = error.message === 'Unauthorized' ? 401 : 500
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

  describe('POST /api/farms - Farm Creation with Fixed Validation', () => {
    test('should create farm with empty googleMapsUrl', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        name: 'Test Farmer',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-123',
        farmName: 'Test Farm',
        location: 'Test Location',
        latitude: 13.7563,
        longitude: 100.5018,
        sizeHectares: 10,
        googleMapsUrl: null,
        ownerId: 'user-123',
        owner: {
          id: 'user-123',
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          latitude: 13.7563,
          longitude: 100.5018,
          sizeHectares: 10,
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            farmName: 'Test Farm',
            latitude: 13.7563,
            longitude: 100.5018,
            sizeHectares: 10,
            googleMapsUrl: null,
          }),
        })
      )
    })

    test('should create farm with null googleMapsUrl', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-123',
        farmName: 'Test Farm',
        location: 'Test Location',
        googleMapsUrl: null,
        ownerId: 'user-123',
        owner: {
          id: 'user-123',
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          googleMapsUrl: null,
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleMapsUrl: null,
          }),
        })
      )
    })

    test('should create farm with valid googleMapsUrl', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-123',
        farmName: 'Test Farm',
        location: 'Test Location',
        googleMapsUrl: 'https://maps.google.com/?q=13.7563,100.5018',
        ownerId: 'user-123',
        owner: {
          id: 'user-123',
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          googleMapsUrl: 'https://maps.google.com/?q=13.7563,100.5018',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleMapsUrl: 'https://maps.google.com/?q=13.7563,100.5018',
          }),
        })
      )
    })

    test('should create farm with numeric latitude, longitude, and sizeHectares', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-123',
        farmName: 'Test Farm',
        location: 'Test Location',
        latitude: 20.0836,
        longitude: 99.8325,
        sizeHectares: 25.5,
        googleMapsUrl: null,
        ownerId: 'user-123',
        owner: {
          id: 'user-123',
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          latitude: 20.0836,
          longitude: 99.8325,
          sizeHectares: 25.5,
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(mockPrisma.farm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            latitude: 20.0836,
            longitude: 99.8325,
            sizeHectares: 25.5,
          }),
        })
      )

      // Verify types are correct
      const createCall = mockPrisma.farm.create.mock.calls[0]?.[0]
      if (createCall && createCall.data) {
        expect(typeof createCall.data.latitude).toBe('number')
        expect(typeof createCall.data.longitude).toBe('number')
        expect(typeof createCall.data.sizeHectares).toBe('number')
      }
    })

    test('should reject farm with invalid googleMapsUrl', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          googleMapsUrl: 'not a valid url',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject farm with string latitude', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          latitude: '13.7563', // String instead of number
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject farm with string longitude', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          longitude: '100.5018', // String instead of number
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject farm with string sizeHectares', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          sizeHectares: '25.5', // String instead of number
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject farm with out-of-range latitude', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          latitude: 91, // Out of range
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should reject farm with out-of-range longitude', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Test Farm',
          location: 'Test Location',
          longitude: 181, // Out of range
          googleMapsUrl: '',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockPrisma.farm.create).not.toHaveBeenCalled()
    })

    test('should create farm with complete valid data', async () => {
      mockRequireAuth.mockResolvedValueOnce({
        id: 'user-123',
        roles: ['Farmer'],
        isActive: true,
        isSuperAdmin: false,
      })
      mockRequireRole.mockImplementationOnce(() => {})

      mockPrisma.farm.create.mockResolvedValueOnce({
        id: 'farm-123',
        farmName: 'Doi Chang Coffee Farm',
        location: 'Chiang Rai, Thailand',
        latitude: 20.0836,
        longitude: 99.8325,
        altitude: '1200',
        sizeHectares: 25.5,
        varieties: ['Arabica', 'Typica'],
        ownerNames: ['John Doe'],
        caretakerNames: ['Jane Smith'],
        googleMapsUrl: 'https://maps.google.com/?q=20.0836,99.8325',
        ownerId: 'user-123',
        owner: {
          id: 'user-123',
          name: 'Test Farmer',
          email: 'farmer@test.com',
        },
      })

      const { POST } = await import('@/app/api/farms/route')

      const request = new NextRequest('http://localhost:3001/api/farms', {
        method: 'POST',
        body: JSON.stringify({
          farmName: 'Doi Chang Coffee Farm',
          location: 'Chiang Rai, Thailand',
          latitude: 20.0836,
          longitude: 99.8325,
          altitude: '1200',
          sizeHectares: 25.5,
          varieties: ['Arabica', 'Typica'],
          ownerNames: ['John Doe'],
          caretakerNames: ['Jane Smith'],
          googleMapsUrl: 'https://maps.google.com/?q=20.0836,99.8325',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('successfully')
      expect(data.farm).toBeDefined()
      expect(data.farm.farmName).toBe('Doi Chang Coffee Farm')
      expect(data.farm.latitude).toBe(20.0836)
      expect(data.farm.longitude).toBe(99.8325)
      expect(data.farm.sizeHectares).toBe(25.5)
      expect(data.farm.googleMapsUrl).toBe('https://maps.google.com/?q=20.0836,99.8325')
    })
  })
})
