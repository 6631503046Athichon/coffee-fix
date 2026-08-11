import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find all duplicate groups
  const duplicates = await prisma.$queryRaw<{ roasterId: string; greenBeanLotId: string; cnt: number }[]>`
    SELECT "roasterId", "greenBeanLotId", COUNT(*)::int as cnt
    FROM "RoasterInventoryItem"
    GROUP BY "roasterId", "greenBeanLotId"
    HAVING COUNT(*) > 1
  `

  if (duplicates.length === 0) {
    console.log('No duplicates found. Migration should work now.')
    return
  }

  console.log(`Found ${duplicates.length} duplicate group(s). Merging...`)

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

    // Keep the first record (oldest), merge everything into it
    const [keep, ...remove] = records

    // Sum up weights from duplicates
    const extraClaimed = remove.reduce((sum, r) => sum + r.claimedWeightKg, 0)
    const extraRemaining = remove.reduce((sum, r) => sum + r.remainingWeightKg, 0)

    // Collect all roastBatch IDs from duplicates that need to be moved
    const batchIdsToMove = remove.flatMap(r => r.roastBatches.map(b => b.id))

    console.log(`\nMerging roasterId=${dup.roasterId}, greenBeanLotId=${dup.greenBeanLotId}`)
    console.log(`  Keeping: ${keep.id} (claimed=${keep.claimedWeightKg}, remaining=${keep.remainingWeightKg})`)
    console.log(`  Removing ${remove.length} duplicate(s), adding claimed=${extraClaimed}, remaining=${extraRemaining}`)
    if (batchIdsToMove.length > 0) {
      console.log(`  Moving ${batchIdsToMove.length} roast batch(es) to main record`)
    }

    await prisma.$transaction(async (tx) => {
      // Move roast batches from duplicates to the main record
      if (batchIdsToMove.length > 0) {
        await tx.roastBatch.updateMany({
          where: { id: { in: batchIdsToMove } },
          data: { roasterInventoryId: keep.id },
        })
      }

      // Delete the duplicate records
      await tx.roasterInventoryItem.deleteMany({
        where: { id: { in: remove.map(r => r.id) } },
      })

      // Update the kept record with merged weights
      await tx.roasterInventoryItem.update({
        where: { id: keep.id },
        data: {
          claimedWeightKg: keep.claimedWeightKg + extraClaimed,
          remainingWeightKg: keep.remainingWeightKg + extraRemaining,
        },
      })
    })

    console.log(`  Done! New claimed=${keep.claimedWeightKg + extraClaimed}, remaining=${keep.remainingWeightKg + extraRemaining}`)
  }

  console.log('\nAll duplicates merged successfully! You can now run the migration.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
