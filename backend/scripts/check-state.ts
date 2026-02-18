import prisma from '../src/lib/prisma';

async function main() {
  const rbLots = await prisma.greenBeanLot.findMany({
    where: { lotId: { startsWith: 'RB-' } },
    select: { lotId: true, currentWeightKg: true, initialWeightKg: true, availabilityStatus: true, externalSource: true, sourceType: true },
    orderBy: { lotId: 'asc' },
  });
  console.log('=== RB Lots ===');
  rbLots.forEach(l => {
    const src = (l.externalSource as any)?.parentLotCode || 'N/A';
    console.log(`  ${l.lotId} | ${l.currentWeightKg}/${l.initialWeightKg} kg | ${l.availabilityStatus} | src=${src} | type=${l.sourceType}`);
  });

  const internalAvail = await prisma.greenBeanLot.findMany({
    where: { sourceType: 'Internal', availabilityStatus: 'Available', currentWeightKg: { gt: 0 } },
    select: { lotId: true, currentWeightKg: true },
    orderBy: { lotId: 'asc' },
  });
  console.log('\n=== Available Internal Lots (Roaster sees these) ===');
  internalAvail.forEach(l => console.log(`  ${l.lotId} | ${l.currentWeightKg} kg`));

  const withdrawals = await prisma.greenBeanWithdrawal.findMany({
    orderBy: { date: 'desc' },
    take: 5,
    include: { greenBeanLot: { select: { lotId: true } } },
  });
  console.log('\n=== Recent Withdrawals ===');
  withdrawals.forEach(w => console.log(`  ${w.greenBeanLot.lotId} | ${w.amountKg} kg | ${w.withdrawalType} | ${w.date.toISOString()}`));

  await prisma.$disconnect();
}
main();
