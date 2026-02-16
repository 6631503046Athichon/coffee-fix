import prisma from '../src/lib/prisma';

async function checkInventoryIds() {
  const items = await prisma.roasterInventoryItem.findMany({
    select: { id: true, inventoryId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  
  console.log('Inventory Items:');
  items.forEach((item, i) => {
    console.log(`${i + 1}. inventoryId: ${item.inventoryId || 'NULL'} | id: ${item.id.substring(0, 8)}... | createdAt: ${item.createdAt}`);
  });
  
  await prisma.$disconnect();
}

checkInventoryIds();
