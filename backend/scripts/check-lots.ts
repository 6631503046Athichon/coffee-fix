import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const lots = await p.greenBeanLot.findMany({
    select: { id: true, lotId: true, sourceType: true, availabilityStatus: true, currentWeightKg: true, initialWeightKg: true, grade: true },
    orderBy: { lotId: 'asc' }
  });
  console.log("=== ALL GREEN BEAN LOTS (with display IDs) ===");
  for (const l of lots) {
    const n = parseInt(l.id.substring(0, 6), 16) % 1000;
    const displayId = "GBL-2026-" + String(n).padStart(3, "0");
    console.log(displayId, "|", l.lotId, "| source:", l.sourceType, "| status:", l.availabilityStatus, "| weight:", l.currentWeightKg + "/" + l.initialWeightKg, "| grade:", l.grade);
  }

  console.log("\n=== RECENT WITHDRAWALS ===");
  const w = await p.greenBeanWithdrawal.findMany({
    select: { greenBeanLotId: true, amountKg: true, withdrawalType: true, date: true },
    orderBy: { date: 'desc' },
    take: 15
  });
  for (const x of w) {
    const n = parseInt(x.greenBeanLotId.substring(0, 6), 16) % 1000;
    console.log("GBL-2026-" + String(n).padStart(3, "0"), "| amount:", x.amountKg, "kg |", x.withdrawalType, "|", x.date);
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
