import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Cleaning up duplicate RB lots and fixing data ===\n')

  // 1. Find all lots with parentLotCode in externalSource (these are RB lots)
  const allLots = await prisma.greenBeanLot.findMany({
    select: { id: true, lotId: true, externalSource: true, currentWeightKg: true, initialWeightKg: true, availabilityStatus: true },
    orderBy: { createdAt: 'asc' },
  })

  const rbLots = allLots.filter(l => {
    const src = l.externalSource as any
    return src && src.parentLotCode
  })

  console.log('Found', rbLots.length, 'RB-type lots:')
  rbLots.forEach(l => {
    const src = l.externalSource as any
    console.log(`  ${l.lotId} | ${l.currentWeightKg}/${l.initialWeightKg} kg | ${l.availabilityStatus} | from ${src.parentLotCode}`)
  })

  // 2. Group by parentLotCode and keep only one per source (the earliest one)
  const byParent: Record<string, typeof rbLots> = {}
  for (const l of rbLots) {
    const src = l.externalSource as any
    const key = src.parentLotCode
    if (!byParent[key]) byParent[key] = []
    byParent[key].push(l)
  }

  const toDelete: string[] = []
  const toKeep: typeof rbLots = []

  for (const [parentCode, lots] of Object.entries(byParent)) {
    // Keep the first one (earliest), delete the rest
    const [keep, ...dupes] = lots
    toKeep.push(keep)
    for (const d of dupes) {
      toDelete.push(d.id)
    }
  }

  if (toDelete.length > 0) {
    console.log(`\nDeleting ${toDelete.length} duplicate RB lots...`)
    // First delete any withdrawals referencing these lots
    await prisma.greenBeanWithdrawal.deleteMany({
      where: { greenBeanLotId: { in: toDelete } }
    })
    // Then delete any roaster inventory items
    await prisma.roasterInventoryItem.deleteMany({
      where: { greenBeanLotId: { in: toDelete } }
    })
    // Then delete the lots
    await prisma.greenBeanLot.deleteMany({
      where: { id: { in: toDelete } }
    })
    console.log('Deleted duplicates')
  }

  // 3. Re-number the remaining RB lots with proper RB-XXX IDs
  console.log('\nRe-numbering RB lots...')
  for (let i = 0; i < toKeep.length; i++) {
    const rbId = `RB-${String(i + 1).padStart(3, '0')}`
    await prisma.greenBeanLot.update({
      where: { id: toKeep[i].id },
      data: { lotId: rbId },
    })
    const src = toKeep[i].externalSource as any
    console.log(`  ${toKeep[i].lotId} -> ${rbId} (from ${src.parentLotCode})`)
  }

  // 4. Also check the user's latest withdrawal and create RB lot if missing
  // Find all withdrawals that don't have a corresponding RB lot
  const allWithdrawals = await prisma.greenBeanWithdrawal.findMany({
    orderBy: { date: 'desc' },
    include: { greenBeanLot: { select: { lotId: true, id: true, parchmentLotId: true, grade: true, processorScore: true, createdById: true } } },
  })

  // Get the parent lot IDs that already have RB lots
  const existingParentIds = new Set(toKeep.map(l => (l.externalSource as any).parentLotCode))

  // Group withdrawals by lot
  const withdrawalsByLot: Record<string, { lotId: string, total: number, lot: any }> = {}
  for (const w of allWithdrawals) {
    const key = w.greenBeanLot.lotId || w.greenBeanLotId
    if (!withdrawalsByLot[key]) {
      withdrawalsByLot[key] = { lotId: w.greenBeanLot.lotId || '', total: 0, lot: w.greenBeanLot }
    }
    withdrawalsByLot[key].total += w.amountKg
  }

  // Create RB lots for any withdrawn lots that don't have one yet
  let rbCount = toKeep.length
  for (const [lotCode, info] of Object.entries(withdrawalsByLot)) {
    // Skip if this lot already has an RB lot, or if this IS an RB lot, or if total is 0
    if (existingParentIds.has(lotCode) || lotCode.startsWith('RB-') || info.total <= 0) continue
    // Skip External lots
    const fullLot = await prisma.greenBeanLot.findFirst({ where: { lotId: lotCode }, select: { sourceType: true } })
    if (!fullLot || fullLot.sourceType !== 'Internal') continue

    rbCount++
    const rbId = `RB-${String(rbCount).padStart(3, '0')}`
    await prisma.greenBeanLot.create({
      data: {
        lotId: rbId,
        sourceType: 'Internal',
        parchmentLotId: info.lot.parchmentLotId,
        grade: info.lot.grade,
        initialWeightKg: info.total,
        currentWeightKg: info.total,
        availabilityStatus: 'Available',
        processorScore: info.lot.processorScore,
        createdById: info.lot.createdById,
        externalSource: { parentLotId: info.lot.id, parentLotCode: lotCode },
      },
    })
    console.log(`\nCreated ${rbId} | ${info.total} kg | from ${lotCode}`)
  }

  // 5. Fix lots with 0 weight to have Withdrawn status
  const zeroLots = await prisma.greenBeanLot.findMany({
    where: { currentWeightKg: { lte: 0 }, availabilityStatus: 'Available' },
    select: { id: true, lotId: true },
  })
  for (const lot of zeroLots) {
    await prisma.greenBeanLot.update({
      where: { id: lot.id },
      data: { availabilityStatus: 'Withdrawn' },
    })
    console.log(`Fixed ${lot.lotId}: status -> Withdrawn`)
  }

  // 6. Verify final state
  console.log('\n=== Final RB Lots ===')
  const finalRbs = await prisma.greenBeanLot.findMany({
    where: { lotId: { startsWith: 'RB-' } },
    select: { lotId: true, currentWeightKg: true, availabilityStatus: true, externalSource: true },
    orderBy: { lotId: 'asc' },
  })
  finalRbs.forEach(l => {
    const src = l.externalSource as any
    console.log(`${l.lotId} | ${l.currentWeightKg} kg | ${l.availabilityStatus} | from: ${src?.parentLotCode}`)
  })

  console.log('\nDone!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
