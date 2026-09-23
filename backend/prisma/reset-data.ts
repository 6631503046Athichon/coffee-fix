// Empties every table behind a Prisma model so the database can be seeded
// from scratch. The schema, the migrations table and any table Prisma does not
// model are left alone.
//
// Dry run — lists each table and its row count, deletes nothing:
//   npx tsx --env-file=.env.vercel.local prisma/reset-data.ts
// Wipe, then add the basic users and lookup lists back:
//   npx tsx --env-file=.env.vercel.local prisma/reset-data.ts --yes
//   npx tsx --env-file=.env.vercel.local prisma/seed.ts
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Pass --env-file=<file> to tsx.')
  }
  console.log(`Database: ${new URL(process.env.DATABASE_URL).host}\n`)

  const existing = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `
  const existingNames = new Set(existing.map((row) => row.tablename))
  const tables = Prisma.dmmf.datamodel.models
    .map((model) => model.dbName ?? model.name)
    .filter((table) => existingNames.has(table))

  let totalRows = 0
  for (const table of tables) {
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM "${table}"`,
    )
    totalRows += Number(count)
    console.log(`  ${table.padEnd(24)} ${count}`)
  }
  console.log(`\n${tables.length} tables, ${totalRows} rows`)

  if (!process.argv.includes('--yes')) {
    console.log('Dry run: nothing was deleted. Re-run with --yes to empty these tables.')
    return
  }

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
  console.log('All tables emptied. Run prisma/seed.ts next to add the basic users back.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
