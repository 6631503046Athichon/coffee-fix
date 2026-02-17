import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Group records by year from createdAt, then assign sequential displayId
 * Format: {PREFIX}-{YEAR}-{NUMBER} e.g. HL-2025-1, HL-2026-2
 */
async function populateForModel(
  model: any,
  prefix: string,
  modelName: string
) {
  const records = await model.findMany({ orderBy: { createdAt: 'asc' } })

  // Group by year
  const byYear: Record<number, typeof records> = {}
  for (const rec of records) {
    const year = new Date(rec.createdAt).getFullYear()
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(rec)
  }

  let total = 0
  const parts: string[] = []

  for (const [year, recs] of Object.entries(byYear).sort()) {
    for (let i = 0; i < recs.length; i++) {
      const displayId = `${prefix}-${year}-${i + 1}`
      await model.update({
        where: { id: recs[i].id },
        data: { displayId },
      })
    }
    parts.push(`${year}: ${recs.length} records (${prefix}-${year}-1 to ${prefix}-${year}-${recs.length})`)
    total += recs.length
  }

  console.log(`${modelName}: ${total} records`)
  parts.forEach(p => console.log(`  ${p}`))
}

async function populateDisplayIds() {
  console.log('Populating displayIds with year format...\n')

  await populateForModel(prisma.harvestLot, 'HL', 'HarvestLot')
  await populateForModel(prisma.processingBatch, 'PB', 'ProcessingBatch')
  await populateForModel(prisma.parchmentLot, 'PCH', 'ParchmentLot')
  await populateForModel(prisma.greenBeanLot, 'GBL', 'GreenBeanLot')

  console.log('\nDone!')
}

populateDisplayIds()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
