/**
 * An in-memory "DocumentSequence" counter for tests: it answers the one
 * statement lib/documentSequence sends (INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING "lastValue") the way Postgres would, so the real nextDisplayId /
 * nextDisplayIds / getNext*Number code runs in route tests.
 *
 * Give a hand-made Prisma mock `$queryRaw: jest.fn(mockSequence.queryRaw)`
 * (re-apply it after a mockReset), or use helpers/memoryPrisma, which has
 * one built in.
 */

type Row = Record<string, any>

/** True for lib/documentSequence's counter upsert. */
export const isSequenceStatement = (strings: readonly string[]) =>
  strings.join('?').includes('INSERT INTO "DocumentSequence"')

export function createMemorySequence() {
  let counters: Record<string, number> = {}

  // The statement's first three parameters are key, floor and count. Like
  // GREATEST in the real statement, the counter never goes below the floor.
  function reserve(values: unknown[]): Row[] {
    const [key, floor, count] = values as [string, number, number]
    const lastValue = Math.max(counters[key] ?? 0, floor) + count
    counters[key] = lastValue
    return [{ lastValue }]
  }

  return {
    /** A `$queryRaw` for the counter statement; any other raw SQL throws. */
    queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> => {
      if (!isSequenceStatement(strings)) {
        throw new Error('memorySequence: unexpected $queryRaw')
      }
      return reserve(values)
    },
    reserve,
    /** Series key ("HL-2026") -> last number handed out. Mutable: tests may seed it. */
    counters: () => counters,
    snapshot: () => ({ ...counters }),
    restore: (saved: Record<string, number>) => {
      counters = saved
    },
    reset: () => {
      counters = {}
    },
  }
}

export type MemorySequence = ReturnType<typeof createMemorySequence>
