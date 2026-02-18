import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  console.log("=== GREEN BEAN LOTS ===");
  const lots = await p.greenBeanLot.findMany({
    select: { id: true, lotId: true, sourceType: true, availabilityStatus: true, currentWeightKg: true, initialWeightKg: true, grade: true },
    orderBy: { lotId: 'asc' }
  });
  lots.forEach(l => console.log(JSON.stringify(l)));

  console.log("\n=== RECENT WITHDRAWALS ===");
  const w = await p.greenBeanWithdrawal.findMany({
    select: { id: true, greenBeanLotId: true, amountKg: true, withdrawalType: true, purpose: true, date: true },
    orderBy: { date: 'desc' },
    take: 20
  });
  w.forEach(x => console.log(JSON.stringify(x)));

  console.log("\n=== ROASTER INVENTORY ===");
  const inv = await p.roasterInventoryItem.findMany({
    select: { id: true, roasterId: true, greenBeanLotId: true, claimedWeightKg: true, remainingWeightKg: true, inventoryId: true },
  });
  inv.forEach(x => console.log(JSON.stringify(x)));

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
