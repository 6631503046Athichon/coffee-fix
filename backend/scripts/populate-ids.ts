/**
 * Script to populate lotId for GreenBeanLots and inventoryId for RoasterInventoryItems
 * Run this after adding these fields to the schema
 */

import prisma from '../src/lib/prisma';

async function populateIds() {
  console.log('🔄 Starting to populate IDs...\n');

  try {
    // Populate Green Bean Lot IDs
    console.log('📦 Populating Green Bean Lot IDs...');
    const lots = await prisma.greenBeanLot.findMany({
      where: {
        OR: [
          { lotId: null },
          { lotId: '' }
        ]
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    });

    if (lots.length > 0) {
      console.log(`   Found ${lots.length} lots without lotId`);
      for (let i = 0; i < lots.length; i++) {
        const lotId = `GBL-${String(i + 1).padStart(3, '0')}`;
        await prisma.greenBeanLot.update({
          where: { id: lots[i].id },
          data: { lotId }
        });
        console.log(`   ✓ Assigned ${lotId}`);
      }
      console.log(`✅ Successfully assigned lotIds to ${lots.length} lots\n`);
    } else {
      console.log('   ✅ All lots already have lotId\n');
    }

    // Populate Roaster Inventory IDs
    console.log('📦 Populating Roaster Inventory IDs...');
    const inventoryItems = await prisma.roasterInventoryItem.findMany({
      where: {
        OR: [
          { inventoryId: null },
          { inventoryId: '' }
        ]
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    });

    if (inventoryItems.length > 0) {
      console.log(`   Found ${inventoryItems.length} inventory items without inventoryId`);
      for (let i = 0; i < inventoryItems.length; i++) {
        const inventoryId = `INV-${String(i + 1).padStart(3, '0')}`;
        await prisma.roasterInventoryItem.update({
          where: { id: inventoryItems[i].id },
          data: { inventoryId }
        });
        console.log(`   ✓ Assigned ${inventoryId}`);
      }
      console.log(`✅ Successfully assigned inventoryIds to ${inventoryItems.length} items\n`);
    } else {
      console.log('   ✅ All inventory items already have inventoryId\n');
    }

  } catch (error) {
    console.error('❌ Error populating IDs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

populateIds()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
