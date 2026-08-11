const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('=== HarvestLots ===');
  const hl = await prisma.harvestLot.findMany({
    include: { processingBatches: { select: { id: true, displayId: true } } }
  });
  hl.forEach(h => {
    console.log(`  ${h.displayId} | farmerName: ${h.farmerName} | batches: ${h.processingBatches.length}`);
    h.processingBatches.forEach(b => console.log(`    -> PB: ${b.displayId}`));
  });

  console.log('\n=== ProcessingBatches ===');
  const pb = await prisma.processingBatch.findMany({
    include: {
      harvestLot: { select: { displayId: true } },
      parchmentLots: { select: { id: true, displayId: true } }
    }
  });
  pb.forEach(b => {
    console.log(`  ${b.displayId} | from: ${b.harvestLot?.displayId} | parchmentLots: ${b.parchmentLots.length}`);
    b.parchmentLots.forEach(p => console.log(`    -> PCH: ${p.displayId}`));
  });

  console.log('\n=== ParchmentLots ===');
  const pch = await prisma.parchmentLot.findMany({
    include: { greenBeanLots: { select: { id: true, displayId: true, grade: true } } }
  });
  pch.forEach(p => {
    console.log(`  ${p.displayId} | weightKg: ${p.weightKg} | greenBeanLots: ${p.greenBeanLots.length}`);
    p.greenBeanLots.forEach(g => console.log(`    -> GBL: ${g.displayId} (${g.grade})`));
  });

  console.log('\n=== GreenBeanLots (all) ===');
  const gbl = await prisma.greenBeanLot.findMany({
    select: { id: true, displayId: true, grade: true, currentWeightKg: true, parchmentLotId: true }
  });
  gbl.forEach(g => {
    console.log(`  ${g.displayId} | grade: ${g.grade} | weight: ${g.currentWeightKg}kg | parchmentLotId: ${g.parchmentLotId ? 'linked' : 'NULL'}`);
  });

  await prisma.$disconnect();
}
check();
