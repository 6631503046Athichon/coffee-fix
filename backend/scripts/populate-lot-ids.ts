/**
 * Script to populate lotId for existing GreenBeanLots
 * Run this after adding the lotId field to the schema
 */

import prisma from '../src/lib/prisma';

async function populateLotIds() {
  console.log('🔄 Starting to populate lot IDs for existing green bean lots...');

  try {
    // Get all green bean lots without a lotId, ordered by creation date
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

    if (lots.length === 0) {
      console.log('✅ No lots need lotId assignment. All done!');
      return;
    }

    console.log(`📊 Found ${lots.length} lots without lotId`);

    // Assign sequential lotIds
    for (let i = 0; i < lots.length; i++) {
      const lotId = `GBL-${String(i + 1).padStart(3, '0')}`;
      await prisma.greenBeanLot.update({
        where: { id: lots[i].id },
        data: { lotId }
      });
      console.log(`  ✓ Assigned ${lotId} to lot ${lots[i].id}`);
    }

    console.log(`✅ Successfully assigned lotIds to ${lots.length} lots`);
  } catch (error) {
    console.error('❌ Error populating lot IDs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

populateLotIds()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
