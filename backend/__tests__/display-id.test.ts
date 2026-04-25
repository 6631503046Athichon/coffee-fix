/**
 * Tests for displayId allocation helpers in lib/utils.
 *
 * Covers:
 *   - nextDisplayId reads max correctly across edge cases
 *   - nextDisplayIds returns N sequential IDs from one read (the fix for the
 *     "loop calls all return the same id" bug)
 *   - withDisplayIdRetry retries on P2002/displayId, gives up on other errors,
 *     and exhausts after N retries
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

describe('displayId helpers', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  describe('nextDisplayId', () => {
    test('starts at 1 when no rows exist', async () => {
      const { nextDisplayId } = await import('@/lib/utils')
      const model = { findMany: jest.fn(async () => []) }

      const id = await nextDisplayId(model, 'HL')

      const year = new Date().getFullYear()
      expect(id).toBe(`HL-${year}-1`)
    })

    test('returns max + 1 when rows exist', async () => {
      const { nextDisplayId } = await import('@/lib/utils')
      const year = new Date().getFullYear()
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
      const year = new Date().getFullYear()
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
      const year = new Date().getFullYear()
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
      const year = new Date().getFullYear()
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
