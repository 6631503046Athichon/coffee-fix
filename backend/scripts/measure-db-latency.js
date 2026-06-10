// Throwaway diagnostic: how much each DB round-trip costs from this machine.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const t = () => performance.now()

async function main() {
  let s = t()
  await prisma.$queryRaw`SELECT 1`
  console.log(`connect + first query : ${Math.round(t() - s)} ms`)

  for (let i = 1; i <= 3; i++) {
    s = t()
    await prisma.$queryRaw`SELECT 1`
    console.log(`sequential query #${i}  : ${Math.round(t() - s)} ms`)
  }

  s = t()
  await Promise.all(Array.from({ length: 7 }, () => prisma.$queryRaw`SELECT 1`))
  console.log(`7 queries in parallel : ${Math.round(t() - s)} ms (wall)`)

  s = t()
  await prisma.farm.findMany({ take: 50 })
  console.log(`farm.findMany(50)     : ${Math.round(t() - s)} ms`)

  s = t()
  await prisma.harvestLot.findMany({
    take: 50,
    include: { farm: { select: { id: true, farmName: true } } },
  })
  console.log(`harvestLot + include  : ${Math.round(t() - s)} ms`)
}

main().finally(() => prisma.$disconnect())
