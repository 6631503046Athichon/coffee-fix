/**
 * Tests for displayId allocation helpers in lib/utils.
 *
 * Covers:
 *   - nextDisplayId reads max correctly across edge cases
 *   - nextDisplayIds returns N sequential IDs from one read (the fix for the
 *     "loop calls all return the same id" bug)
 *   - withDisplayIdRetry retries on P2002/displayId, gives up on other errors,
 *     and exhausts after N retries
 *
 * The numbers come from the DocumentSequence counter (lib/documentSequence);
 * `@/lib/prisma` here answers its statement from helpers/memorySequence.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { createMemorySequence } from './helpers/memorySequence'

const mockSequence = createMemorySequence()
const mockQueryRaw = jest.fn(mockSequence.queryRaw)

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { $queryRaw: (...args: any[]) => (mockQueryRaw as any)(...args) },
}))

describe('displayId helpers', () => {
  beforeEach(() => {
    jest.resetModules()
    mockSequence.reset()
    mockQueryRaw.mockClear()
  })

  describe('nextDisplayId', () => {
    test('starts at 1 when no rows exist', async () => {
      const { nextDisplayId } = await import('@/lib/utils')
      const model = { findMany: jest.fn(async () => []) }

      const id = await nextDisplayId(model, 'HL')

      const year = (await import('@/lib/utils')).businessYear() // Thai year
      expect(id).toBe(`HL-${year}-1`)
    })

    test('returns max + 1 when rows exist', async () => {
      const { nextDisplayId } = await import('@/lib/utils')
      const year = (await import('@/lib/utils')).businessYear() // Thai year
      const model = {
        findMany: jest.fn(async () => [
          { displayId: `HL-${year}-1` },
          { displayId: `HL-${year}-7` },
          { displayId: `HL-${year}-3` },
        ]),
      }

      const id = await nextDisplayId(model, 'HL')

      expect(id).toBe(`HL-${year}-8`)
    })

    test('ignores non-numeric suffixes', async () => {
      const { nextDisplayId } = await import('@/lib/utils')
      const year = (await import('@/lib/utils')).businessYear() // Thai year
      const model = {
        findMany: jest.fn(async () => [
          { displayId: `HL-${year}-abc` },
          { displayId: `HL-${year}-2` },
        ]),
      }

      const id = await nextDisplayId(model, 'HL')

      expect(id).toBe(`HL-${year}-3`)
    })
  })

  describe('nextDisplayIds (bulk)', () => {
    test('returns sequential ids from one read', async () => {
      const { nextDisplayIds } = await import('@/lib/utils')
      const year = (await import('@/lib/utils')).businessYear() // Thai year
      const model = {
        findMany: jest.fn(async () => [{ displayId: `GBL-${year}-4` }]),
      }

      const ids = await nextDisplayIds(model, 'GBL', 3)

      expect(ids).toEqual([
        `GBL-${year}-5`,
        `GBL-${year}-6`,
        `GBL-${year}-7`,
      ])
      // Critical: only ONE findMany call, not three. The previous bug was
      // calling nextDisplayId in a loop which re-read the same max each time
      // and returned all-identical strings.
      expect(model.findMany).toHaveBeenCalledTimes(1)
    })

    test('returns empty array for count <= 0', async () => {
      const { nextDisplayIds } = await import('@/lib/utils')
      const model = { findMany: jest.fn(async () => []) }

      expect(await nextDisplayIds(model, 'GBL', 0)).toEqual([])
      expect(await nextDisplayIds(model, 'GBL', -1)).toEqual([])
      // Skips the DB hit entirely when nothing's needed.
      expect(model.findMany).not.toHaveBeenCalled()
    })

    test('starts at 1 when table is empty', async () => {
      const { nextDisplayIds } = await import('@/lib/utils')
      const year = (await import('@/lib/utils')).businessYear() // Thai year
      const model = { findMany: jest.fn(async () => []) }

      const ids = await nextDisplayIds(model, 'PCH', 2)

      expect(ids).toEqual([`PCH-${year}-1`, `PCH-${year}-2`])
    })
  })

  describe('withDisplayIdRetry', () => {
    test('returns the attempt result on first success', async () => {
      const { withDisplayIdRetry } = await import('@/lib/utils')
      const attempt = jest.fn(async () => ({ id: 'created' }))

      const result = await withDisplayIdRetry(attempt)

      expect(result).toEqual({ id: 'created' })
      expect(attempt).toHaveBeenCalledTimes(1)
    })

    test('retries on P2002 with displayId target', async () => {
      const { withDisplayIdRetry } = await import('@/lib/utils')
      const conflict: any = new Error('Unique constraint failed')
      conflict.code = 'P2002'
      conflict.meta = { target: ['displayId'] }

      const attempt = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(conflict)
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce('eventually-ok')

      const result = await withDisplayIdRetry(attempt, 5)

      expect(result).toBe('eventually-ok')
      expect(attempt).toHaveBeenCalledTimes(3)
    })

    test('also recognises string-shaped meta.target', async () => {
      const { withDisplayIdRetry } = await import('@/lib/utils')
      const conflict: any = new Error('Unique constraint failed')
      conflict.code = 'P2002'
      conflict.meta = { target: 'displayId' }

      const attempt = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce('ok')

      const result = await withDisplayIdRetry(attempt)

      expect(result).toBe('ok')
      expect(attempt).toHaveBeenCalledTimes(2)
    })

    test('does NOT retry on P2002 against a different unique column', async () => {
      const { withDisplayIdRetry } = await import('@/lib/utils')
      const otherUnique: any = new Error('Unique constraint failed')
      otherUnique.code = 'P2002'
      otherUnique.meta = { target: ['email'] }

      const attempt = jest.fn<() => Promise<unknown>>().mockRejectedValue(otherUnique)

      await expect(withDisplayIdRetry(attempt)).rejects.toBe(otherUnique)
      expect(attempt).toHaveBeenCalledTimes(1)
    })

    test('does NOT retry on non-Prisma errors', async () => {
      const { withDisplayIdRetry } = await import('@/lib/utils')
      const boom = new Error('totally unrelated')
      const attempt = jest.fn<() => Promise<unknown>>().mockRejectedValue(boom)

      await expect(withDisplayIdRetry(attempt)).rejects.toBe(boom)
      expect(attempt).toHaveBeenCalledTimes(1)
    })

    test('exhausts retries and rethrows the last conflict error', async () => {
      const { withDisplayIdRetry } = await import('@/lib/utils')
      const conflict: any = new Error('Unique constraint failed')
      conflict.code = 'P2002'
      conflict.meta = { target: ['displayId'] }

      const attempt = jest.fn<() => Promise<unknown>>().mockRejectedValue(conflict)

      await expect(withDisplayIdRetry(attempt, 3)).rejects.toBe(conflict)
      expect(attempt).toHaveBeenCalledTimes(3)
    })
  })
})

describe('displayId counter: a number is never handed out twice', () => {
  beforeEach(() => {
    jest.resetModules()
    mockSequence.reset()
    mockQueryRaw.mockClear()
  })

  // A table whose rows the test can add and remove, like the real one.
  const table = (...displayIds: string[]) => {
    const rows = displayIds.map(displayId => ({ displayId }))
    return {
      rows,
      model: {
        findMany: jest.fn(async (args: any) =>
          rows.filter(r => r.displayId.startsWith(args.where.displayId.startsWith)),
        ),
      },
    }
  }

  test('deleting the newest lot does not give its number to the next lot', async () => {
    const { nextDisplayId, businessYear } = await import('@/lib/utils')
    const year = businessYear()
    const { rows, model } = table(`HL-${year}-7`)

    const eighth = await nextDisplayId(model, 'HL')
    expect(eighth).toBe(`HL-${year}-8`)
    rows.push({ displayId: eighth })

    rows.splice(rows.findIndex(r => r.displayId === eighth), 1) // deleted

    expect(await nextDisplayId(model, 'HL')).toBe(`HL-${year}-9`)
  })

  test('a counter row that is behind the table catches up with it (rows written without the counter)', async () => {
    const { nextDisplayId, businessYear } = await import('@/lib/utils')
    const year = businessYear()
    mockSequence.counters()[`GBL-${year}`] = 3
    const { model } = table(`GBL-${year}-5`, `GBL-${year}-12`)

    expect(await nextDisplayId(model, 'GBL')).toBe(`GBL-${year}-13`)
  })

  test('nextDisplayIds reserves the whole block in one statement, and the next caller starts after it', async () => {
    const { nextDisplayIds, nextDisplayId, businessYear } = await import('@/lib/utils')
    const year = businessYear()
    const { model } = table(`GBL-${year}-4`)

    // Two Hull & Grades that both read the table before either created a lot.
    const first = await nextDisplayIds(model, 'GBL', 3)
    const second = await nextDisplayIds(model, 'GBL', 2)

    expect(first).toEqual([`GBL-${year}-5`, `GBL-${year}-6`, `GBL-${year}-7`])
    expect(second).toEqual([`GBL-${year}-8`, `GBL-${year}-9`])
    expect(mockQueryRaw).toHaveBeenCalledTimes(2)
    expect(await nextDisplayId(model, 'GBL')).toBe(`GBL-${year}-10`)
  })

  test('each series counts on its own, keyed by prefix and year', async () => {
    const { nextDisplayId, businessYear } = await import('@/lib/utils')
    const year = businessYear()

    expect(await nextDisplayId(table().model, 'HL')).toBe(`HL-${year}-1`)
    expect(await nextDisplayId(table().model, 'PB')).toBe(`PB-${year}-1`)
    expect(await nextDisplayId(table().model, 'HL')).toBe(`HL-${year}-2`)
    expect(mockSequence.counters()).toEqual({ [`HL-${year}`]: 2, [`PB-${year}`]: 1 })
  })

  test('the number is taken with one atomic upsert that never goes below the table', async () => {
    const { nextDisplayId, businessYear } = await import('@/lib/utils')
    const year = businessYear()

    await nextDisplayId(table(`PCH-${year}-2`).model, 'PCH')

    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = mockQueryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join('?').replace(/\s+/g, ' ')
    expect(sql).toContain('INSERT INTO "DocumentSequence"')
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE')
    expect(sql).toContain('GREATEST("DocumentSequence"."lastValue", ?::integer) + ?::integer')
    expect(sql).toContain('RETURNING "lastValue"')
    expect(values.slice(0, 3)).toEqual([`PCH-${year}`, 2, 1])
  })

  test('a transaction client passed in takes the number, not the app client', async () => {
    const { nextDisplayIds, businessYear } = await import('@/lib/utils')
    const year = businessYear()
    const txSequence = createMemorySequence()
    const tx = { $queryRaw: jest.fn(txSequence.queryRaw) }

    const ids = await nextDisplayIds(table().model, 'GBL', 2, tx)

    expect(ids).toEqual([`GBL-${year}-1`, `GBL-${year}-2`])
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })
})
