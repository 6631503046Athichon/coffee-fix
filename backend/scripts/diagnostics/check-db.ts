import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log('\n========================================');
  console.log('   DATABASE STATUS CHECK');
  console.log('========================================\n');

  try {
    await prisma.$connect();
    console.log('✓ Database connection: OK\n');

    console.log('TABLE RECORDS:');
    console.log('─────────────────────────────');
    
    const counts = {
      User: await prisma.user.count(),
      Farm: await prisma.farm.count(),
      HarvestLot: await prisma.harvestLot.count(),
      ProcessingBatch: await prisma.processingBatch.count(),
      ParchmentLot: await prisma.parchmentLot.count(),
      GreenBeanLot: await prisma.greenBeanLot.count(),
      WeatherRecord: await prisma.weatherRecord.count(),
      SoilAnalysis: await prisma.soilAnalysis.count(),
      GAPLogEntry: await prisma.gAPLogEntry.count(),
      CropYear: await prisma.cropYear.count(),
      Customer: await prisma.customer.count(),
      CuppingSession: await prisma.cuppingSession.count(),
      ActivityType: await prisma.activityType.count(),
      ProcessType: await prisma.processType.count(),
      RoastBatch: await prisma.roastBatch.count(),
      SaleOrder: await prisma.saleOrder.count(),
      Invoice: await prisma.invoice.count(),
    };

    for (const [name, count] of Object.entries(counts)) {
      const status = count > 0 ? '✓' : '○';
      console.log(`${status} ${name.padEnd(20)} ${count}`);
    }

    console.log('\n\nRELATION CHECKS:');
    console.log('─────────────────────────────');
    const lotsWithFarm = await prisma.harvestLot.count({ where: { farmId: { not: null } } });
    const lotsWithoutFarm = await prisma.harvestLot.count({ where: { farmId: null } });
    console.log(`HarvestLots with Farm:    ${lotsWithFarm}`);
    console.log(`HarvestLots without Farm: ${lotsWithoutFarm}`);

    console.log('\n\nHARVEST LOT STATUS:');
    console.log('─────────────────────────────');
    const statusCounts = await prisma.harvestLot.groupBy({ by: ['status'], _count: { status: true } });
    statusCounts.forEach(s => console.log(`${String(s.status).padEnd(20)} ${s._count.status}`));

    console.log('\n\nPROCESSING BATCH STATUS:');
    console.log('─────────────────────────────');
    const batchCounts = await prisma.processingBatch.groupBy({ by: ['status'], _count: { status: true } });
    batchCounts.forEach(s => console.log(`${String(s.status).padEnd(20)} ${s._count.status}`));

    console.log('\n\nPOTENTIAL ISSUES:');
    console.log('─────────────────────────────');
    const farmsNoCoords = await prisma.farm.count({ where: { OR: [{ latitude: null }, { longitude: null }] } });
    if (farmsNoCoords > 0) console.log(`⚠ Farms without GPS: ${farmsNoCoords}`);
    else console.log('✓ All farms have GPS coordinates');

    console.log('\n========================================\n');
  } catch (error) {
    console.error('✗ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
