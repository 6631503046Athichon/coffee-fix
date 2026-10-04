/**
 * F31: the public trace (GET /api/trace/:publicId, no login, reached from the
 * QR code on the bag) returned processNotes, the processor's internal
 * free-text notes. It also returned a bought-in lot's whole externalSource,
 * which carries the price the roaster paid, its currency and their supplier
 * notes. The story now reads no processNotes and keeps only the
 * externalSource keys the public page shows. The staff preview shares the
 * same payload.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockPrisma: any = {
  greenBeanLot: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

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

// What a Roaster's "add purchased lot" form stores, plus legacy keys.
const purchasedSource = {
  originName: 'Yirgacheffe',
  producerName: 'Konga Coop',
  variety: 'Heirloom',
  processType: 'Washed',
  purchaseDate: '2026-08-01',
  tasteNote: 'Jasmine, lemon',
  pricePerKg: 640,
  currency: 'THB',
  supplierNotes: 'Paid 50% up front, rest on delivery',
  supplierName: 'Bean Broker Co',
  certificateNumber: 'CERT-123',
  notes: 'Call Khun Lek before re-ordering',
  origin: 'Ethiopia',
}

const publicSource = {
  originName: 'Yirgacheffe',
  producerName: 'Konga Coop',
  variety: 'Heirloom',
  processType: 'Washed',
  purchaseDate: '2026-08-01',
  tasteNote: 'Jasmine, lemon',
}

const storyLot = (externalSource: unknown) => ({
  id: 'lot-1',
  grade: 'Grade A',
  sourceType: 'External',
  externalSource,
  cuppingFragrance: null,
  cuppingFlavor: null,
  cuppingAftertaste: null,
  cuppingAcidity: null,
  cuppingBody: null,
  cuppingBalance: null,
  cuppingOverall: null,
  cuppingUniformity: null,
  cuppingCleanCup: null,
  cuppingSweetness: null,
  parchmentLot: null,
  roastBatches: [],
})

const publicTrace = async () => {
  const { GET } = await import('@/app/api/trace/[publicId]/route')
  const response = await GET(new NextRequest('http://localhost:3001/api/trace/pub-9'), {
    params: Promise.resolve({ publicId: 'pub-9' }),
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<any>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthUser = null
})

describe('lib/trace', () => {
  test('the public select never reads processNotes', async () => {
    const { publicTraceSelect } = await import('@/lib/trace')
    expect(publicTraceSelect.parchmentLot.select.processingBatch.select).not.toHaveProperty('processNotes')
    expect(JSON.stringify(publicTraceSelect)).not.toContain('processNotes')
  })

  test('publicExternalSource keeps only the keys the page shows', async () => {
    const { publicExternalSource } = await import('@/lib/trace')
    expect(publicExternalSource(purchasedSource)).toEqual(publicSource)
    // Keys that are not there stay absent rather than becoming null.
    expect(publicExternalSource({ originName: 'Kenya', pricePerKg: 500 })).toEqual({ originName: 'Kenya' })
  })

  test.each([
    ['null', null],
    ['an array', ['pricePerKg']],
    ['a string', 'Kenya'],
    ['a number', 640],
  ])('publicExternalSource gives null for %s', async (_label, value) => {
    const { publicExternalSource } = await import('@/lib/trace')
    expect(publicExternalSource(value as any)).toBeNull()
  })
})

describe('GET /api/trace/:publicId', () => {
  test('asks the database for no processNotes', async () => {
    mockPrisma.greenBeanLot.findFirst.mockResolvedValue(storyLot(null))
    await publicTrace()
    const { select } = mockPrisma.greenBeanLot.findFirst.mock.calls[0][0]
    expect(JSON.stringify(select)).not.toContain('processNotes')
  })

  test("a bought-in lot shows its origin story but not the roaster's price or notes", async () => {
    mockPrisma.greenBeanLot.findFirst.mockResolvedValue(storyLot(purchasedSource))
    const body = await publicTrace()
    expect(body.lot.externalSource).toEqual(publicSource)
    const text = JSON.stringify(body)
    for (const secret of ['640', 'Paid 50%', 'Bean Broker', 'CERT-123', 'Khun Lek']) {
      expect(text).not.toContain(secret)
    }
  })

  test('an internal lot still has no externalSource', async () => {
    mockPrisma.greenBeanLot.findFirst.mockResolvedValue({ ...storyLot(null), sourceType: 'Internal' })
    const body = await publicTrace()
    expect(body.lot.externalSource).toBeNull()
  })
})

describe('GET /api/green-bean-lots/:id/trace-preview', () => {
  test('the preview shows the same trimmed externalSource customers will see', async () => {
    mockAuthUser = { id: 'admin-1', email: null, username: null, name: 'Admin', roles: ['Admin'], isActive: true, isSuperAdmin: false }
    mockPrisma.greenBeanLot.findUnique.mockImplementation(async (args: any) =>
      args.select.createdById ? { createdById: 'roaster-1', publicTraceId: null } : storyLot(purchasedSource))
    const { GET } = await import('@/app/api/green-bean-lots/[id]/trace-preview/route')
    const response = await GET(
      new NextRequest('http://localhost:3001/api/green-bean-lots/lot-1/trace-preview'),
      { params: Promise.resolve({ id: 'lot-1' }) },
    )
    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(body.lot.externalSource).toEqual(publicSource)
    expect(JSON.stringify(mockPrisma.greenBeanLot.findUnique.mock.calls[1][0].select)).not.toContain('processNotes')
  })
})
