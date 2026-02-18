/**
 * Script to populate lotId for GreenBeanLots and inventoryId for RoasterInventoryItems
 * Run this after adding these fields to the schema
 */

import prisma from '../src/lib/prisma';

async function populateIds() {
  console.log('🔄 Starting to populate IDs...\n');

  try {
    // Populate Green Bean Lot IDs (skip RB- lots which have their own naming)
    console.log('📦 Populating Green Bean Lot IDs...');
    const lots = await prisma.greenBeanLot.findMany({
      where: {
        OR: [
          { lotId: null },
          { lotId: '' }
        ]
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, externalSource: true }
    });

    if (lots.length > 0) {
      // Separate RB lots (have parentLotId in externalSource) from regular GBL lots
      const rbLots = lots.filter(l => (l.externalSource as any)?.parentLotId);
      const gblLots = lots.filter(l => !(l.externalSource as any)?.parentLotId);

      // Find the highest existing GBL number to continue from
      const existingGblLots = await prisma.greenBeanLot.findMany({
        where: { lotId: { startsWith: 'GBL-' } },
        select: { lotId: true },
      });
      let maxGbl = 0;
      existingGblLots.forEach((l) => {
        if (l.lotId) {
          const match = l.lotId.match(/GBL-(\d+)/);
          if (match) maxGbl = Math.max(maxGbl, parseInt(match[1], 10));
        }
      });

      // Assign GBL-XXX to regular lots
      console.log(`   Found ${gblLots.length} regular lots without lotId (starting from GBL-${String(maxGbl + 1).padStart(3, '0')})`);
      for (let i = 0; i < gblLots.length; i++) {
        const lotId = `GBL-${String(maxGbl + 1 + i).padStart(3, '0')}`;
        await prisma.greenBeanLot.update({
          where: { id: gblLots[i].id },
          data: { lotId }
        });
        console.log(`   ✓ Assigned ${lotId}`);
      }

      // Find the highest existing RB number
      const existingRbLots = await prisma.greenBeanLot.findMany({
        where: { lotId: { startsWith: 'RB-' } },
        select: { lotId: true },
      });
      let maxRb = 0;
      existingRbLots.forEach((l) => {
        if (l.lotId) {
          const match = l.lotId.match(/RB-(\d+)/);
          if (match) maxRb = Math.max(maxRb, parseInt(match[1], 10));
        }
      });

      // Assign RB-XXX to withdrawal-derived lots
      console.log(`   Found ${rbLots.length} RB lots without lotId (starting from RB-${String(maxRb + 1).padStart(3, '0')})`);
      for (let i = 0; i < rbLots.length; i++) {
        const lotId = `RB-${String(maxRb + 1 + i).padStart(3, '0')}`;
        await prisma.greenBeanLot.update({
          where: { id: rbLots[i].id },
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
