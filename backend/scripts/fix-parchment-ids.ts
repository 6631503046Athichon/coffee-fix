import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all parchment lot IDs
  const parchmentLots = await prisma.parchmentLot.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' }
  });
  
  const parchmentIds = parchmentLots.map(x => x.id);
  console.log('Total parchment lots:', parchmentIds.length);
  
  // GBL-014 to GBL-020 all have the same parchmentLotId (7b88920a...)
  // Reassign them to different parchment lots for proper traceability
  const assignments = [
    { lotId: 'GBL-014', parchmentLotId: parchmentIds[5] },   // PCH-2026-116
    { lotId: 'GBL-015', parchmentLotId: parchmentIds[6] },   // PCH-2026-734
    { lotId: 'GBL-016', parchmentLotId: parchmentIds[7] },   // PCH-2026-501
    { lotId: 'GBL-017', parchmentLotId: parchmentIds[8] },   // PCH-2026-200
    { lotId: 'GBL-018', parchmentLotId: parchmentIds[9] },   // PCH-2026-701
    { lotId: 'GBL-019', parchmentLotId: parchmentIds[0] },   // PCH-2026-149
    { lotId: 'GBL-020', parchmentLotId: parchmentIds[10] },  // PCH-2026-890
  ];

  for (const a of assignments) {
    await prisma.greenBeanLot.update({
      where: { lotId: a.lotId },
      data: { parchmentLotId: a.parchmentLotId }
    });
    const n = parseInt(a.parchmentLotId.substring(0, 6), 16) % 1000;
    console.log(`${a.lotId} -> PCH-2026-${String(n).padStart(3, '0')}`);
  }

  console.log('\nVerifying all green bean lots:');
  const allGbl = await prisma.greenBeanLot.findMany({
    select: { lotId: true, parchmentLotId: true },
    orderBy: { lotId: 'asc' }
  });
  
  for (const g of allGbl) {
    if (g.parchmentLotId) {
      const n = parseInt(g.parchmentLotId.substring(0, 6), 16) % 1000;
      console.log(`${g.lotId} -> PCH-2026-${String(n).padStart(3, '0')}`);
    } else {
      console.log(`${g.lotId} -> NULL`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
