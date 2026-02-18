import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Fixing data: Remove auto-created inventory items, create RB lots ===\n')

  // 1. Delete the auto-created RoasterInventoryItems for GBL-018, GBL-019, GBL-020
  const lotsToFix = ['GBL-018', 'GBL-019', 'GBL-020']
  
  for (const lotCode of lotsToFix) {
    const lot = await prisma.greenBeanLot.findFirst({ where: { lotId: lotCode } })
    if (!lot) {
      console.log(`${lotCode}: not found, skipping`)
      continue
    }

    // Delete any auto-created inventory items for this lot
    const deleted = await prisma.roasterInventoryItem.deleteMany({
      where: { greenBeanLotId: lot.id }
    })
    if (deleted.count > 0) {
      console.log(`${lotCode}: Deleted ${deleted.count} auto-created inventory items`)
    }

    // Get total withdrawn amount
    const withdrawals = await prisma.greenBeanWithdrawal.findMany({
      where: { greenBeanLotId: lot.id }
    })
    const totalWithdrawn = withdrawals.reduce((s, w) => s + w.amountKg, 0)

    // Check if RB lot already exists for this source
    const existingRb = await prisma.greenBeanLot.findFirst({
      where: {
        lotId: { startsWith: 'RB-' },
        externalSource: { path: ['parentLotCode'], equals: lotCode }
      }
    })

    if (existingRb) {
      console.log(`${lotCode}: RB lot already exists (${existingRb.lotId}), skipping`)
      continue
    }

    if (totalWithdrawn > 0) {
      // Generate next RB-XXX ID
      const allRbLots = await prisma.greenBeanLot.findMany({
        select: { lotId: true },
        where: { lotId: { startsWith: 'RB-' } },
      })
      let maxRb = 0
      allRbLots.forEach(l => {
        if (l.lotId) {
          const match = l.lotId.match(/RB-(\d+)/)
          if (match) {
            const num = parseInt(match[1], 10)
            if (num > maxRb) maxRb = num
          }
        }
      })
      const rbLotId = `RB-${String(maxRb + 1).padStart(3, '0')}`

      // Create RB lot
      const rbLot = await prisma.greenBeanLot.create({
        data: {
          lotId: rbLotId,
          sourceType: 'Internal',
          parchmentLotId: lot.parchmentLotId,
          grade: lot.grade,
          initialWeightKg: totalWithdrawn,
          currentWeightKg: totalWithdrawn,
          availabilityStatus: 'Available',
          processorScore: lot.processorScore,
          createdById: lot.createdById,
          externalSource: { parentLotId: lot.id, parentLotCode: lot.lotId },
        },
      })
      console.log(`${lotCode}: Created ${rbLotId} with ${totalWithdrawn} kg (source: ${lotCode})`)
    }

    // Ensure the original lot status is correct
    if (lot.currentWeightKg <= 0 && lot.availabilityStatus !== 'Withdrawn') {
      await prisma.greenBeanLot.update({
        where: { id: lot.id },
        data: { availabilityStatus: 'Withdrawn' },
      })
      console.log(`${lotCode}: Status -> Withdrawn`)
    }
  }

  // Verify
  console.log('\n=== Verification ===')
  const rbLots = await prisma.greenBeanLot.findMany({
    where: { lotId: { startsWith: 'RB-' } },
    select: { lotId: true, currentWeightKg: true, availabilityStatus: true, grade: true, externalSource: true },
  })
  rbLots.forEach(l => {
    const src = l.externalSource as any
    console.log(`${l.lotId} | ${l.currentWeightKg} kg | ${l.availabilityStatus} | ${l.grade} | from: ${src?.parentLotCode}`)
  })

  const invItems = await prisma.roasterInventoryItem.findMany({
    select: { inventoryId: true, greenBeanLotId: true, claimedWeightKg: true },
  })
  console.log(`\nRoaster inventory items: ${invItems.length}`)
  invItems.forEach(i => console.log(`  ${i.inventoryId} | ${i.claimedWeightKg} kg`))

  console.log('\nDone!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
