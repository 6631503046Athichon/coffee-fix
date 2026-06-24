// Diagnostic: how many weather records exist, by source, by farm, and the
// configured auto-fetch cadence. Reads DATABASE_URL from backend/.env.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const total = await prisma.weatherRecord.count()
  console.log(`รวมทั้งหมด: ${total} records\n`)

  const bySource = await prisma.weatherRecord.groupBy({
    by: ['source'],
    _count: { _all: true },
  })
  console.log('แยกตามแหล่ง:')
  for (const s of bySource) console.log(`  ${String(s.source).padEnd(10)} ${s._count._all}`)

  const farms = await prisma.farm.findMany({
    select: {
      id: true,
      farmName: true,
      weatherAutoFetchEnabled: true,
      weatherAutoFetchInterval: true,
      _count: { select: { weatherRecords: true } },
    },
  })
  console.log('\nแยกตามฟาร์ม (auto-fetch ทุกกี่นาที / เปิดอยู่ไหม / มีกี่ records):')
  for (const f of farms) {
    console.log(
      `  ${(f.farmName || f.id).padEnd(18)} ทุก ${f.weatherAutoFetchInterval} min | ${f.weatherAutoFetchEnabled ? 'ON ' : 'OFF'} | ${f._count.weatherRecords} records`,
    )
  }

  const oldest = await prisma.weatherRecord.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
  const newest = await prisma.weatherRecord.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  if (oldest && newest) {
    const days = (newest.createdAt - oldest.createdAt) / 86400000
    console.log(`\nช่วงเวลา: ${oldest.createdAt.toISOString().slice(0, 16)} → ${newest.createdAt.toISOString().slice(0, 16)} (${days.toFixed(1)} วัน)`)
    if (days > 0) console.log(`เฉลี่ย: ${(total / days).toFixed(1)} records/วัน`)
  }
}

main().catch((e) => console.error(e.message.split('\n')[0])).finally(() => prisma.$disconnect())
