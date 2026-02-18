import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find GBL-018 (displays as GBL-2026-440)
  const lot = await prisma.greenBeanLot.findFirst({ where: { lotId: 'GBL-018' } })
  if (!lot) {
    console.log('GBL-018 not found')
    return
  }
  console.log('Found GBL-018:', lot.id)
  console.log('  weight:', lot.currentWeightKg, '/', lot.initialWeightKg)
  console.log('  status:', lot.availabilityStatus)
  console.log('  source:', lot.sourceType)

  // Get withdrawals
  const withdrawals = await prisma.greenBeanWithdrawal.findMany({ where: { greenBeanLotId: lot.id } })
  console.log('\nWithdrawals:', withdrawals.length)
  let totalWithdrawn = 0
  withdrawals.forEach(w => {
    console.log(`  - ${w.amountKg} kg | ${w.withdrawalType} | ${w.purpose}`)
    totalWithdrawn += w.amountKg
  })
  console.log('  Total withdrawn:', totalWithdrawn, 'kg')

  // Check existing roaster inventory for this lot
  const existing = await prisma.roasterInventoryItem.findMany({ where: { greenBeanLotId: lot.id } })
  console.log('\nExisting roaster inventory items for this lot:', existing.length)

  if (existing.length === 0) {
    console.log('\n--- Creating RoasterInventoryItem for the withdrawn amount ---')
    
    // Get next inventory ID
    const allItems = await prisma.roasterInventoryItem.findMany({
      select: { inventoryId: true },
      where: { inventoryId: { not: null } }
    })
    let maxNumber = 0
    allItems.forEach(item => {
      if (item.inventoryId) {
        const match = item.inventoryId.match(/INV-(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxNumber) maxNumber = num
        }
      }
    })
    const inventoryId = `INV-${String(maxNumber + 1).padStart(3, '0')}`

    // Find roaster user
    const roaster = await prisma.user.findFirst({
      where: { roles: { has: 'Roaster' } },
      select: { id: true, name: true },
    })
    
    if (!roaster) {
      console.log('No roaster user found')
      return
    }
    console.log('Roaster:', roaster.name, roaster.id)

    // Create inventory item with the total withdrawn amount
    const inv = await prisma.roasterInventoryItem.create({
      data: {
        inventoryId,
        roasterId: roaster.id,
        greenBeanLotId: lot.id,
        claimedWeightKg: totalWithdrawn,
        remainingWeightKg: totalWithdrawn,
      },
    })
    console.log('Created:', inv.inventoryId, '|', totalWithdrawn, 'kg')

    // Also fix the lot status to Withdrawn since weight is 0
    if (lot.currentWeightKg <= 0) {
      await prisma.greenBeanLot.update({
        where: { id: lot.id },
        data: { availabilityStatus: 'Withdrawn' },
      })
      console.log('Updated lot status to Withdrawn')
    }
  }

  // Also fix GBL-019 and GBL-020 which have 0 weight
  for (const lotId of ['GBL-019', 'GBL-020']) {
    const otherLot = await prisma.greenBeanLot.findFirst({ where: { lotId } })
    if (otherLot && otherLot.currentWeightKg <= 0) {
      // Check for withdrawals
      const ws = await prisma.greenBeanWithdrawal.findMany({ where: { greenBeanLotId: otherLot.id } })
      const wsTotal = ws.reduce((s, w) => s + w.amountKg, 0)
      
      // Check existing inventory
      const existingInv = await prisma.roasterInventoryItem.findMany({ where: { greenBeanLotId: otherLot.id } })
      
      if (existingInv.length === 0 && wsTotal > 0) {
        const allItems2 = await prisma.roasterInventoryItem.findMany({
          select: { inventoryId: true },
          where: { inventoryId: { not: null } }
        })
        let max2 = 0
        allItems2.forEach(item => {
          if (item.inventoryId) {
            const match = item.inventoryId.match(/INV-(\d+)/)
            if (match) {
              const num = parseInt(match[1], 10)
              if (num > max2) max2 = num
            }
          }
        })
        const invId = `INV-${String(max2 + 1).padStart(3, '0')}`
        
        const roaster = await prisma.user.findFirst({
          where: { roles: { has: 'Roaster' } },
          select: { id: true },
        })
        
        if (roaster) {
          await prisma.roasterInventoryItem.create({
            data: {
              inventoryId: invId,
              roasterId: roaster.id,
              greenBeanLotId: otherLot.id,
              claimedWeightKg: wsTotal,
              remainingWeightKg: wsTotal,
            },
          })
          console.log(`\nFixed ${lotId}: Created ${invId} | ${wsTotal} kg`)
        }
      }
      
      // Fix status
      if (otherLot.availabilityStatus !== 'Withdrawn') {
        await prisma.greenBeanLot.update({
          where: { id: otherLot.id },
          data: { availabilityStatus: 'Withdrawn' },
        })
        console.log(`Fixed ${lotId}: Status → Withdrawn`)
      }
    }
  }
  
  console.log('\nDone!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
