import { NextRequest } from 'next/server'

const mockFindMany = jest.fn()
const mockPrisma = {
  harvestLot: { findMany: mockFindMany, count: jest.fn().mockResolvedValue(1) },
  farm: { findMany: jest.fn().mockResolvedValue([]) },
  cropYear: { findMany: jest.fn().mockResolvedValue([]) },
  processType: { findMany: jest.fn().mockResolvedValue([]) },
  activityType: { findMany: jest.fn().mockResolvedValue([]) },
  coffeeGrade: { findMany: jest.fn().mockResolvedValue([]) },
  customer: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
}
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/middleware', () => ({
  requireAuth: jest.fn().mockResolvedValue({ id: 'processor', roles: ['Processor'] }),
  handleApiError: (error: Error) => new Response(JSON.stringify({ error: error.message }), { status: 500 }),
}))

const legacyLot = {
  id: 'hl-f442', weightKg: 400, remainingWeightKg: 200,
  status: 'ReadyForProcessing', _count: { processingBatches: 1 },
}

describe('harvest reads after whole-lot processing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindMany.mockResolvedValue([legacyLot])
  })

  test('bulk-load hides old processed lots without relying on the latest 50 batches', async () => {
    const { GET } = await import('@/app/api/bulk-load/route')
    const response = await GET(new NextRequest('http://localhost/api/bulk-load?phase=1'))
    expect(response.status).toBe(200)
    expect((await response.json()).harvestLots).toEqual([
      { id: 'hl-f442', weightKg: 400, remainingWeightKg: 0, status: 'Complete' },
    ])
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ _count: { select: { processingBatches: true } } }),
    }))
  })

  test('the paginated list returns the same consumed state', async () => {
    const { GET } = await import('@/app/api/harvest-lots/route')
    const response = await GET(new NextRequest('http://localhost/api/harvest-lots'))
    expect(response.status).toBe(200)
    expect((await response.json()).harvestLots[0]).toMatchObject({
      weightKg: 400, remainingWeightKg: 0, status: 'Complete',
    })
  })

  test('Ready filtering and its total both exclude existing batches', async () => {
    mockFindMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/harvest-lots/route')
    await GET(new NextRequest('http://localhost/api/harvest-lots?status=ReadyForProcessing'))
    const where = { status: 'ReadyForProcessing', processingBatches: { none: {} } }
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where }))
    expect(mockPrisma.harvestLot.count).toHaveBeenCalledWith({ where })
  })
})
