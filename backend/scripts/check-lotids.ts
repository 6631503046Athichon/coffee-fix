import prisma from '../src/lib/prisma';

async function main() {
  // Count total lots
  const total = await prisma.greenBeanLot.count();
  console.log(`Total GreenBeanLots: ${total}`);
  
  // Count lots with null lotId
  const nullCount = await prisma.greenBeanLot.count({ where: { lotId: null } });
  console.log(`Lots with null lotId: ${nullCount}`);
  
  // Count lots with empty lotId
  const emptyCount = await prisma.greenBeanLot.count({ where: { lotId: '' } });
  console.log(`Lots with empty lotId: ${emptyCount}`);
  
  // Count lots with lotId set
  const setCount = await prisma.greenBeanLot.count({ where: { NOT: { lotId: null } } });
  console.log(`Lots with lotId set: ${setCount}`);
  
  // Show first 5 lots
  const sample = await prisma.greenBeanLot.findMany({
    take: 5,
    select: { id: true, lotId: true, sourceType: true, currentWeightKg: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('\nFirst 5 lots:');
  sample.forEach(l => console.log(`  id=${l.id.substring(0,8)}... | lotId=${l.lotId} | ${l.sourceType} | ${l.currentWeightKg} kg`));
  
  await prisma.$disconnect();
}
main();
