// Quick Supabase connectivity + schema check. Reads the (possibly
// commented-out) Supabase DATABASE_URL from .env.
const fs = require('fs')
const path = require('path')

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
const line = envText
  .split(/\r?\n/)
  .map((l) => l.replace(/^#\s*/, '')) // tolerate commented-out line
  .find((l) => /^DATABASE_URL=.*supabase/.test(l))

if (!line) {
  console.log('No Supabase DATABASE_URL found in .env')
  process.exit(0)
}
const url = line.replace(/^DATABASE_URL=/, '').replace(/^["']|["']$/g, '')
process.env.DATABASE_URL = url
console.log('Supabase:', url.replace(/:[^:@/]+@/, ':****@').split('?')[0], '\n')

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  // Raw connectivity first (doesn't depend on app tables existing).
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ เชื่อมต่อได้')
  } catch (e) {
    console.log('❌ เชื่อมต่อไม่ได้:', e.message.split('\n').filter(Boolean)[0])
    await prisma.$disconnect()
    return
  }
  // Then check whether the app schema exists.
  try {
    const u = await prisma.user.count()
    const f = await prisma.farm.count()
    console.log(`✅ มีตารางแล้ว: users=${u}, farms=${f}`)
  } catch (e) {
    const msg = e.message.split('\n').filter((l) => l.trim()).slice(0, 3).join(' | ')
    console.log('⚠️  ตารางยังไม่มี (Supabase ว่าง ต้อง push schema):', msg)
  } finally {
    await prisma.$disconnect()
  }
})()
