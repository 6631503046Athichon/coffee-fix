/**
 * One-off cleanup for duplicate API weather records.
 *
 * The old browser-side auto-fetch could write two rows for the same farm
 * within the same minute (two tabs / StrictMode races). The server-side
 * scheduler + the (farmId, fetchSlot) unique constraint prevent new
 * duplicates, but rows created before the fix are still in the table.
 *
 * This script groups source='API' records by (farmId, minute of
 * createdAt), keeps the newest row in each group, and deletes the rest.
 * Manual records are never touched.
 *
 * Usage (from backend/):
 *   node scripts/dedupe-weather-records.js           # dry run — only reports
 *   node scripts/dedupe-weather-records.js --apply   # actually deletes
 *
 * DATABASE_URL is read from backend/.env (Prisma loads it automatically).
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const records = await prisma.weatherRecord.findMany({
    where: { source: 'API' },
    select: { id: true, farmId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Group by farm + minute. Records are newest-first, so the first row
  // seen in each group is the keeper and everything after is a duplicate.
  const seen = new Set()
  const toDelete = []
  for (const r of records) {
    const minute = Math.floor(new Date(r.createdAt).getTime() / 60000)
    const key = `${r.farmId}:${minute}`
    if (seen.has(key)) {
      toDelete.push(r.id)
    } else {
      seen.add(key)
    }
  }

  console.log(`API weather records: ${records.length}`)
  console.log(`Duplicates (same farm, same minute): ${toDelete.length}`)

  if (toDelete.length === 0) {
    console.log('Nothing to clean up.')
    return
  }

  if (!apply) {
    console.log('\nDry run — nothing deleted. Re-run with --apply to delete.')
    return
  }

  // Chunked deletes so a big backlog doesn't blow the query size limit.
  let deleted = 0
  for (let i = 0; i < toDelete.length; i += 500) {
    const chunk = toDelete.slice(i, i + 500)
    const res = await prisma.weatherRecord.deleteMany({
      where: { id: { in: chunk } },
    })
    deleted += res.count
  }
  console.log(`Deleted ${deleted} duplicate record(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
