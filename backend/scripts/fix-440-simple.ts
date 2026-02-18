import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const roasterId = '6b394408-231a-4a7f-9395-7837b7e2ee6b' // Roaster User

  // Count existing inventory items
  const count = await prisma.roasterInventoryItem.count()
  console.log('Current inventory count:', count)
  const nextNum = count + 1

  // GBL-018 (GBL-2026-440): 12 kg withdrawn, 0 existing inventory
  const lot018 = await prisma.greenBeanLot.findFirst({ where: { lotId: 'GBL-018' } })
  if (lot018) {
    const existing = await prisma.roasterInventoryItem.count({ where: { greenBeanLotId: lot018.id } })
    if (existing === 0) {
      const inv = await prisma.roasterInventoryItem.create({
        data: {
          inventoryId: `INV-${String(nextNum).padStart(3, '0')}`,
          roasterId,
          greenBeanLotId: lot018.id,
          claimedWeightKg: 12,
          remainingWeightKg: 12,
        },
      })
      console.log('Created for GBL-018:', inv.inventoryId, '| 12 kg')

      // Fix lot status
      await prisma.greenBeanLot.update({
        where: { id: lot018.id },
        data: { availabilityStatus: 'Withdrawn' },
      })
      console.log('GBL-018 status -> Withdrawn')
    }
  }

  // GBL-019 (GBL-2026-212): 12 kg withdrawn
  const lot019 = await prisma.greenBeanLot.findFirst({ where: { lotId: 'GBL-019' } })
  if (lot019 && lot019.currentWeightKg <= 0) {
    const existing = await prisma.roasterInventoryItem.count({ where: { greenBeanLotId: lot019.id } })
    if (existing === 0) {
      const inv = await prisma.roasterInventoryItem.create({
        data: {
          inventoryId: `INV-${String(nextNum + 1).padStart(3, '0')}`,
          roasterId,
          greenBeanLotId: lot019.id,
          claimedWeightKg: 12,
          remainingWeightKg: 12,
        },
      })
      console.log('Created for GBL-019:', inv.inventoryId, '| 12 kg')

      await prisma.greenBeanLot.update({
        where: { id: lot019.id },
        data: { availabilityStatus: 'Withdrawn' },
      })
      console.log('GBL-019 status -> Withdrawn')
    }
  }

  // GBL-020 (GBL-2026-646): 20 kg withdrawn
  const lot020 = await prisma.greenBeanLot.findFirst({ where: { lotId: 'GBL-020' } })
  if (lot020 && lot020.currentWeightKg <= 0) {
    const existing = await prisma.roasterInventoryItem.count({ where: { greenBeanLotId: lot020.id } })
    if (existing === 0) {
      const inv = await prisma.roasterInventoryItem.create({
        data: {
          inventoryId: `INV-${String(nextNum + 2).padStart(3, '0')}`,
          roasterId,
          greenBeanLotId: lot020.id,
          claimedWeightKg: 20,
          remainingWeightKg: 20,
        },
      })
      console.log('Created for GBL-020:', inv.inventoryId, '| 20 kg')

      await prisma.greenBeanLot.update({
        where: { id: lot020.id },
        data: { availabilityStatus: 'Withdrawn' },
      })
      console.log('GBL-020 status -> Withdrawn')
    }
  }

  console.log('\nDone!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
