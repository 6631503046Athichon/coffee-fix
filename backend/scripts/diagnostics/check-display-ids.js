const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const hl = await prisma.harvestLot.findMany({ select: { id: true, displayId: true } });
  console.log('HarvestLots:');
  hl.forEach(h => console.log('  id:', h.id.substring(0, 8), '| displayId:', h.displayId));

  const gbl = await prisma.greenBeanLot.findMany({ select: { id: true, displayId: true } });
  console.log('GreenBeanLots:');
  gbl.forEach(g => console.log('  id:', g.id.substring(0, 8), '| displayId:', g.displayId));

  const pb = await prisma.processingBatch.findMany({ select: { id: true, displayId: true } });
  console.log('ProcessingBatches:');
  pb.forEach(b => console.log('  id:', b.id.substring(0, 8), '| displayId:', b.displayId));

  const pch = await prisma.parchmentLot.findMany({ select: { id: true, displayId: true } });
  console.log('ParchmentLots:');
  pch.forEach(l => console.log('  id:', l.id.substring(0, 8), '| displayId:', l.displayId));

  await prisma.$disconnect();
}
check();
