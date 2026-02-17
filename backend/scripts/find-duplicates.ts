import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find duplicates
  const duplicates = await prisma.$queryRaw<any[]>`
    SELECT "roasterId", "greenBeanLotId", COUNT(*)::int as cnt
    FROM "RoasterInventoryItem"
    GROUP BY "roasterId", "greenBeanLotId"
    HAVING COUNT(*) > 1
  `

  console.log('=== Duplicate roasterId + greenBeanLotId combinations ===')
  console.log(JSON.stringify(duplicates, null, 2))

  if (duplicates.length === 0) {
    console.log('No duplicates found!')

    // Show all records for reference
    const all = await prisma.roasterInventoryItem.findMany({
      select: {
        id: true,
        roasterId: true,
        greenBeanLotId: true,
        claimedWeightKg: true,
        remainingWeightKg: true,
      }
    })
    console.log('\n=== All RoasterInventoryItem records ===')
    console.log(JSON.stringify(all, null, 2))
  } else {
    // Show the duplicate records in detail
    for (const dup of duplicates) {
      const records = await prisma.roasterInventoryItem.findMany({
        where: {
          roasterId: dup.roasterId,
          greenBeanLotId: dup.greenBeanLotId,
        },
        include: {
          roastBatches: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      console.log(`\n--- Duplicates for roasterId=${dup.roasterId}, greenBeanLotId=${dup.greenBeanLotId} ---`)
      console.log(JSON.stringify(records, null, 2))
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
