// Gives a displayId to the rows that have none (legacy rows saved before
// displayIds existed). Format: {PREFIX}-{YEAR}-{NUMBER}, e.g. HL-2025-3, with
// YEAR the year of the row's createdAt in Thai time, like new records.
//
// Only rows whose displayId is null are touched. A displayId is printed on
// labels and paperwork, so one that is already set is never renumbered (the
// old version of this script renumbered every row from 1).
//
// Each number is taken from the DocumentSequence counter (lib/documentSequence,
// prisma/sql/009_document_sequences.sql), never below the year's highest
// number already in the table, so it never repeats a number in use or one
// handed out before and since deleted. Same rule as
// POST /api/backfill-display-ids. Needs sql/009 applied first.
//
// Run from backend/:
//   npx tsx --env-file=.env scripts/maintenance/populate-display-ids.ts

import prisma from '../../src/lib/prisma'
import { reserveSequence } from '../../src/lib/documentSequence'
import { businessYear } from '../../src/lib/utils'

type DisplayIdModel = {
  findMany: (args: any) => Promise<any[]>
  updateMany: (args: any) => Promise<{ count: number }>
  count: (args: { where: { displayId: null } }) => Promise<number>
}

const MAX_ATTEMPTS = 5

/** The highest N among this year's `PREFIX-YEAR-N` ids in the table (0 when none). */
async function highestNumber(model: DisplayIdModel, yearPrefix: string): Promise<number> {
  const rows = await model.findMany({
    where: { displayId: { startsWith: yearPrefix } },
    select: { displayId: true },
  })
  let max = 0
  for (const row of rows) {
    const num = parseInt((row.displayId as string).slice(yearPrefix.length), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return max
}

/**
 * Takes the next number of `PREFIX-YEAR` from the counter and writes it to
 * the row if its displayId is still null. Returns the displayId written, or
 * null when the row was numbered meanwhile or no free number was found.
 */
async function assignNumber(
  model: DisplayIdModel,
  id: string,
  prefix: string,
  year: number,
  floor: number
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const displayId = `${prefix}-${year}-${await reserveSequence(`${prefix}-${year}`, floor)}`
    try {
      const { count } = await model.updateMany({
        where: { id, displayId: null },
        data: { displayId },
      })
      return count === 1 ? displayId : null
    } catch (err: any) {
      // A row written without the counter holds this number: take the next one.
      if (err?.code !== 'P2002') throw err
    }
  }
  console.error(`  could not number ${id} after ${MAX_ATTEMPTS} attempts`)
  return null
}

async function populateForModel(model: DisplayIdModel, prefix: string, modelName: string) {
  const records: { id: string; createdAt: Date }[] = await model.findMany({
    where: { displayId: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // Group by year
  const byYear = new Map<number, typeof records>()
  for (const rec of records) {
    const year = businessYear(new Date(rec.createdAt))
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(rec)
  }

  let total = 0
  const parts: string[] = []

  for (const [year, recs] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    const floor = await highestNumber(model, `${prefix}-${year}-`)
    const assigned: string[] = []
    for (const rec of recs) {
      const displayId = await assignNumber(model, rec.id, prefix, year, floor)
      if (displayId) assigned.push(displayId)
    }
    const range = assigned.length > 0 ? ` (${assigned[0]} to ${assigned[assigned.length - 1]})` : ''
    parts.push(`${year}: ${assigned.length} of ${recs.length} records${range}`)
    total += assigned.length
  }

  console.log(`${modelName}: ${total} records without a displayId numbered`)
  parts.forEach(p => console.log(`  ${p}`))
}

async function populateDisplayIds() {
  console.log('Numbering rows that have no displayId...\n')

  const models: [DisplayIdModel, string, string][] = [
    [prisma.harvestLot, 'HL', 'HarvestLot'],
    [prisma.processingBatch, 'PB', 'ProcessingBatch'],
    [prisma.parchmentLot, 'PCH', 'ParchmentLot'],
    [prisma.greenBeanLot, 'GBL', 'GreenBeanLot'],
  ]
  for (const [model, prefix, modelName] of models) {
    await populateForModel(model, prefix, modelName)
  }

  // A row no free number was found for stays without one: the run failed, so
  // it exits 1 for whoever (or whatever) ran it. Counted afresh, so a row the
  // app numbered meanwhile is not a failure.
  let unnumbered = 0
  for (const [model, , modelName] of models) {
    const left = await model.count({ where: { displayId: null } })
    if (left > 0) console.error(`${modelName}: ${left} records still have no displayId`)
    unnumbered += left
  }
  if (unnumbered > 0) {
    console.error(`\nNot done: ${unnumbered} records still have no displayId. Run it again or check the errors above.`)
    process.exitCode = 1
    return
  }

  console.log('\nDone!')
}

populateDisplayIds()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
