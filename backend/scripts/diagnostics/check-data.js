// Throwaway diagnostic: connect to a chosen DATABASE_URL from backend/.env
// and count rows in the key tables, so we can see which database actually
// holds the app's data.
//
// Usage (from backend/):
//   node scripts/diagnostics/check-data.js railway
//   node scripts/diagnostics/check-data.js supabase
//
// Picks the matching DATABASE_URL line out of .env by host substring, so
// passwords never go through the command line.
const fs = require('fs')
const path = require('path')

const which = (process.argv[2] || '').toLowerCase()
const hostNeedle = which === 'supabase' ? 'supabase.com' : 'rlwy.net'

const envText = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
const urls = envText
  .split(/\r?\n/)
  .filter((l) => /^\s*DATABASE_URL\s*=/.test(l))
  .map((l) => l.replace(/^\s*DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, ''))
const url = urls.find((u) => u.includes(hostNeedle))

if (!url) {
  console.error(`No DATABASE_URL for "${which}" (looked for ${hostNeedle}) in .env`)
  process.exit(1)
}

process.env.DATABASE_URL = url
const masked = url.replace(/:[^:@/]+@/, ':****@').split('?')[0]
console.log(`\nConnecting to [${which || 'railway'}]: ${masked}\n`)

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const tables = [
    ['users', () => prisma.user.count()],
    ['farms', () => prisma.farm.count()],
    ['harvestLots', () => prisma.harvestLot.count()],
    ['processingBatches', () => prisma.processingBatch.count()],
    ['parchmentLots', () => prisma.parchmentLot.count()],
    ['greenBeanLots', () => prisma.greenBeanLot.count()],
    ['weatherRecords', () => prisma.weatherRecord.count()],
    ['customers', () => prisma.customer.count()],
  ]
  let total = 0
  for (const [name, fn] of tables) {
    try {
      const n = await fn()
      total += n
      console.log(`  ${name.padEnd(20)} ${n}`)
    } catch (e) {
      console.log(`  ${name.padEnd(20)} ERROR: ${e.message.split('\n')[0]}`)
    }
  }
  console.log(`\n  TOTAL rows (these tables): ${total}`)
}

main()
  .catch((e) => {
    console.error('Connection/query failed:', e.message.split('\n')[0])
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
