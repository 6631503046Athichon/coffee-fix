// Check database data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  console.log('🔍 Checking Database Data...\n');

  try {
    // Check Users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
      },
    });
    console.log(`✅ Users: ${users.length} found`);
    users.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - Roles: ${user.roles.join(', ')}`);
    });

    // Check Activity Types
    const activityTypes = await prisma.activityType.findMany();
    console.log(`\n✅ Activity Types: ${activityTypes.length} found`);
    activityTypes.forEach(at => {
      console.log(`   - ${at.name}${at.description ? ` (${at.description})` : ''}`);
    });

    // Check Process Types
    const processTypes = await prisma.processType.findMany();
    console.log(`\n✅ Process Types: ${processTypes.length} found`);
    processTypes.forEach(pt => {
      const colorScheme = typeof pt.colorScheme === 'string' 
        ? JSON.parse(pt.colorScheme) 
        : pt.colorScheme;
      console.log(`   - ${pt.name} (${colorScheme.badgeColor || 'N/A'})`);
    });

    // Check Crop Years
    const cropYears = await prisma.cropYear.findMany();
    console.log(`\n✅ Crop Years: ${cropYears.length} found`);
    cropYears.forEach(cy => {
      console.log(`   - ${cy.year} (${cy.startDate.toISOString().split('T')[0]} to ${cy.endDate.toISOString().split('T')[0]})`);
    });

    // Check other tables
    const farms = await prisma.farm.count();
    const harvestLots = await prisma.harvestLot.count();
    const processingBatches = await prisma.processingBatch.count();
    
    console.log(`\n📊 Other Data:`);
    console.log(`   - Farms: ${farms}`);
    console.log(`   - Harvest Lots: ${harvestLots}`);
    console.log(`   - Processing Batches: ${processingBatches}`);

    console.log('\n✅ Database connection working!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();

