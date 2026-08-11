// Compare row counts between Railway (DATABASE_URL) and Supabase
// (SUPABASE_URL) to confirm the migration copied everything.
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
const pick = (key) => {
  const l = env.split(/\r?\n/).find((x) => x.startsWith(key + '='))
  return l ? l.replace(key + '=', '').replace(/^["']|["']$/g, '').replace(/\s+$/, '') : null
}
const railway = pick('DATABASE_URL')
const supabase = pick('SUPABASE_URL')

const tables = [
  'user', 'farm', 'harvestLot', 'processingBatch', 'parchmentLot',
  'greenBeanLot', 'weatherRecord', 'soilAnalysis', 'gapLog', 'customer',
  'cropYear', 'processType', 'activityType', 'coffeeVariety',
  'roasterInventory', 'roastBatch', 'cuppingSession', 'saleOrder', 'invoice',
]

async function counts(url) {
  process.env.DATABASE_URL = url
  // Fresh client per datasource
  const { PrismaClient } = require('@prisma/client')
  const p = new PrismaClient({ datasources: { db: { url } } })
  const out = {}
  for (const t of tables) {
    try {
      out[t] = await p[t].count()
    } catch (e) {
      out[t] = 'ERR'
    }
  }
  await p.$disconnect()
  return out
}

;(async () => {
  const r = await counts(railway)
  const s = await counts(supabase)
  console.log('table'.padEnd(20), 'Railway'.padStart(8), 'Supabase'.padStart(9), '  match')
  console.log('-'.repeat(48))
  let allMatch = true
  for (const t of tables) {
    const ok = r[t] === s[t]
    if (!ok) allMatch = false
    console.log(
      t.padEnd(20),
      String(r[t]).padStart(8),
      String(s[t]).padStart(9),
      '  ' + (ok ? '✅' : '❌ ต่าง'),
    )
  }
  console.log('-'.repeat(48))
  console.log(allMatch ? '\n✅ ทุกตารางตรงกัน — migrate สำเร็จ' : '\n⚠️  มีตารางไม่ตรง ดูด้านบน')
})()
