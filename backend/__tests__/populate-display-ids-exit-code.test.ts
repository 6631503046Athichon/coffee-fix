/**
 * scripts/maintenance/populate-display-ids.ts numbers the rows that have no
 * displayId. When rows are still without one at the end (no free number was
 * found for them), the run failed: it sets process.exitCode = 1 so whoever
 * or whatever ran it can tell. A full run leaves the exit code alone.
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'

type Row = Record<string, any>

// Rows without a displayId per model, and the ones the counter could not number.
let unnumbered: Record<string, Row[]> = {}
let stuck = new Set<string>()

const model = (name: string) => ({
  findMany: jest.fn(async (args: any) => (args.where.displayId === null ? unnumbered[name] ?? [] : [])),
  updateMany: jest.fn(async (args: any) => {
    if (stuck.has(args.where.id)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
    unnumbered[name] = (unnumbered[name] ?? []).filter(row => row.id !== args.where.id)
    return { count: 1 }
  }),
  count: jest.fn(async () => (unnumbered[name] ?? []).length),
})

let finished: () => void = () => {}

const mockPrisma: any = {
  harvestLot: model('harvestLot'),
  processingBatch: model('processingBatch'),
  parchmentLot: model('parchmentLot'),
  greenBeanLot: model('greenBeanLot'),
  $disconnect: jest.fn(async () => finished()),
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
}))

jest.mock('@/lib/documentSequence', () => ({
  reserveSequence: jest.fn(async () => 1),
}))

// Runs the script once (it starts on import) and waits for it to disconnect.
async function runScript() {
  const done = new Promise<void>(resolve => {
    finished = resolve
  })
  await jest.isolateModulesAsync(async () => {
    await import('../scripts/maintenance/populate-display-ids')
  })
  await done
}

const savedExitCode = process.exitCode

beforeEach(() => {
  jest.clearAllMocks()
  unnumbered = {}
  stuck = new Set()
  process.exitCode = undefined
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.exitCode = savedExitCode
  jest.restoreAllMocks()
})

describe('populate-display-ids exit code', () => {
  test('a run that numbers every row leaves the exit code alone', async () => {
    unnumbered = {
      harvestLot: [{ id: 'hl-1', createdAt: new Date('2026-03-01T05:00:00Z') }],
      greenBeanLot: [{ id: 'gbl-1', createdAt: new Date('2026-03-02T05:00:00Z') }],
    }

    await runScript()

    expect(process.exitCode).toBeUndefined()
    expect(mockPrisma.harvestLot.updateMany).toHaveBeenCalledWith({
      where: { id: 'hl-1', displayId: null },
      data: { displayId: 'HL-2026-1' },
    })
    expect(mockPrisma.greenBeanLot.count).toHaveBeenCalledWith({ where: { displayId: null } })
  })

  test('rows left without a displayId make it exit 1, and say how many', async () => {
    unnumbered = {
      parchmentLot: [{ id: 'pl-1', createdAt: new Date('2026-03-01T05:00:00Z') }],
      greenBeanLot: [
        { id: 'gbl-1', createdAt: new Date('2026-03-01T05:00:00Z') },
        { id: 'gbl-2', createdAt: new Date('2026-03-02T05:00:00Z') },
      ],
    }
    // Every number tried for these two is already taken.
    stuck = new Set(['pl-1', 'gbl-2'])

    await runScript()

    expect(process.exitCode).toBe(1)
    const errors = (console.error as jest.Mock).mock.calls.map(call => String(call[0]))
    expect(errors).toContain('ParchmentLot: 1 records still have no displayId')
    expect(errors).toContain('GreenBeanLot: 1 records still have no displayId')
    expect(errors.some(line => line.includes('Not done: 2 records still have no displayId'))).toBe(true)
  })
})
