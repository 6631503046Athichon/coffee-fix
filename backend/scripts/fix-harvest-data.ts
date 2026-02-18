import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Fix harvest lots where remainingWeightKg is null — set to weightKg
  const nullRemaining = await prisma.harvestLot.findMany({
    where: { remainingWeightKg: null },
    select: { id: true, farmerName: true, weightKg: true, status: true }
  });
  
  console.log('Harvest lots with null remainingWeightKg:', nullRemaining.length);
  
  for (const lot of nullRemaining) {
    console.log(`  Fixing ${lot.farmerName}: setting remainingWeightKg = ${lot.weightKg}`);
    await prisma.harvestLot.update({
      where: { id: lot.id },
      data: { remainingWeightKg: lot.weightKg }
    });
  }
  
  // Delete any lots with near-zero weight (floating-point artifacts)
  const nearZero = await prisma.harvestLot.findMany({
    where: { weightKg: { lt: 0.01 } },
    select: { id: true, farmerName: true, weightKg: true }
  });
  console.log('\nNear-zero weight lots:', nearZero.length);
  if (nearZero.length > 0) {
    for (const lot of nearZero) {
      console.log(`  Deleting ${lot.id} (${lot.farmerName}, ${lot.weightKg} kg)`);
      await prisma.parchmentLot.deleteMany({ where: { harvestLotId: lot.id } });
      await prisma.processingBatch.deleteMany({ where: { harvestLotId: lot.id } });
      await prisma.harvestLot.delete({ where: { id: lot.id } });
    }
  }
  
  // Delete absurdly heavy lots (>= 10000 kg)
  const tooHeavy = await prisma.harvestLot.findMany({
    where: { weightKg: { gte: 10000 } },
    select: { id: true, farmerName: true, weightKg: true }
  });
  console.log('Extreme weight lots:', tooHeavy.length);
  if (tooHeavy.length > 0) {
    for (const lot of tooHeavy) {
      console.log(`  Deleting ${lot.id} (${lot.farmerName}, ${lot.weightKg} kg)`);
      await prisma.parchmentLot.deleteMany({ where: { harvestLotId: lot.id } });
      await prisma.processingBatch.deleteMany({ where: { harvestLotId: lot.id } });
      await prisma.harvestLot.delete({ where: { id: lot.id } });
    }
  }

  // Show final state
  console.log('\n=== Final harvest lots ===');
  const all = await prisma.harvestLot.findMany({
    select: { farmerName: true, weightKg: true, remainingWeightKg: true, status: true },
    orderBy: { weightKg: 'desc' }
  });
  all.forEach(l => console.log(`  ${l.farmerName} | ${l.weightKg} kg | remaining: ${l.remainingWeightKg} kg | ${l.status}`));
  console.log(`Total: ${all.length}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
