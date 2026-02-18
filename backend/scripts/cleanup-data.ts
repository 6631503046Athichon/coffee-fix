import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Delete harvest lots with extremely small weights (floating-point artifacts)
  const badLots = await prisma.harvestLot.findMany({
    where: { weightKg: { lt: 0.01 } },
    select: { id: true, weightKg: true, farmerName: true }
  });
  console.log('Bad lots (near-zero weight) to delete:', badLots.length);
  badLots.forEach(l => console.log('  ', l.id, l.weightKg, l.farmerName));

  if (badLots.length > 0) {
    const ids = badLots.map(l => l.id);
    // Delete related parchment lots first
    const deletedParchment = await prisma.parchmentLot.deleteMany({ where: { harvestLotId: { in: ids } } });
    console.log('Deleted related parchment lots:', deletedParchment.count);
    // Delete related processing batches
    const deletedBatches = await prisma.processingBatch.deleteMany({ where: { harvestLotId: { in: ids } } });
    console.log('Deleted related processing batches:', deletedBatches.count);
    const deleted = await prisma.harvestLot.deleteMany({ where: { id: { in: ids } } });
    console.log('Deleted bad harvest lots:', deleted.count);
  }

  // 2. Delete harvest lots with absurdly high weights (test data like 100000 kg)
  const testLots = await prisma.harvestLot.findMany({
    where: { weightKg: { gte: 10000 } },
    select: { id: true, weightKg: true, farmerName: true }
  });
  console.log('\nTest lots (extreme weight) to delete:', testLots.length);
  testLots.forEach(l => console.log('  ', l.id, l.weightKg, l.farmerName));

  if (testLots.length > 0) {
    const ids = testLots.map(l => l.id);
    const deletedParchment = await prisma.parchmentLot.deleteMany({ where: { harvestLotId: { in: ids } } });
    console.log('Deleted related parchment lots:', deletedParchment.count);
    const deletedBatches = await prisma.processingBatch.deleteMany({ where: { harvestLotId: { in: ids } } });
    console.log('Deleted related processing batches:', deletedBatches.count);
    const deleted = await prisma.harvestLot.deleteMany({ where: { id: { in: ids } } });
    console.log('Deleted extreme weight harvest lots:', deleted.count);
  }

  // 3. Verify remaining harvest lots
  const remaining = await prisma.harvestLot.findMany({
    select: { id: true, farmerName: true, weightKg: true, remainingWeightKg: true, status: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log('\n=== Remaining harvest lots ===');
  remaining.forEach(l => {
    console.log(`  ${l.farmerName} | weight: ${l.weightKg} kg | remaining: ${l.remainingWeightKg} kg | status: ${l.status}`);
  });
  console.log(`Total: ${remaining.length} harvest lots`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
