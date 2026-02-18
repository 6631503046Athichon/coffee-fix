import prisma from '../src/lib/prisma';

async function main() {
  // Raw SQL to check actual DB columns
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'GreenBeanLot'
    ORDER BY ordinal_position;
  `;
  console.log('=== GreenBeanLot columns in DB ===');
  (columns as any[]).forEach((c: any) => console.log(`  ${c.column_name} (${c.data_type})`));

  const invColumns = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'RoasterInventoryItem'
    ORDER BY ordinal_position;
  `;
  console.log('\n=== RoasterInventoryItem columns in DB ===');
  (invColumns as any[]).forEach((c: any) => console.log(`  ${c.column_name} (${c.data_type})`));

  await prisma.$disconnect();
}
main();
