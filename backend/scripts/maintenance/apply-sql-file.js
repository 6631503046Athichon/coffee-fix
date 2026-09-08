/**
 * Run a .sql file against DATABASE_URL through the Prisma query engine.
 *
 * Why not `prisma db execute`: that goes through the schema engine, which
 * hangs against Supabase's connection pooler. The query engine — the same
 * path the running app uses — copes with the pooler fine, so this splits the
 * file into statements and sends them one at a time.
 *
 * Usage (from backend/):  node scripts/maintenance/apply-sql-file.js prisma/sql/001_coffee_grades.sql
 *
 * Statements are split on ";" at end of line. Keep one statement per
 * ";\n" and don't put semicolons inside string literals.
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/maintenance/apply-sql-file.js <file.sql>')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

// Don't sit forever on a connection that never answers.
const HARD_TIMEOUT_MS = 90_000
const killer = setTimeout(() => {
  console.error(`gave up after ${HARD_TIMEOUT_MS / 1000}s — connection never answered`)
  process.exit(2)
}, HARD_TIMEOUT_MS)

const sql = fs.readFileSync(path.resolve(file), 'utf8')
const statements = sql
  .split(/;\s*\n/)
  .map(s => s.replace(/^\s*--[^\n]*\n?/gm, '').trim()) // drop comment lines
  .filter(Boolean)

const prisma = new PrismaClient({ log: ['error'] })

async function main() {
  console.log(`${statements.length} statement(s) in ${file}`)
  for (const [i, statement] of statements.entries()) {
    const label = statement.split('\n')[0].slice(0, 70)
    if (/^\s*select\b/i.test(statement)) {
      const rows = await prisma.$queryRawUnsafe(statement)
      console.log(`[${i + 1}] ${label}`)
      console.table(rows)
    } else {
      const affected = await prisma.$executeRawUnsafe(statement)
      console.log(`[${i + 1}] ${label}  -> ok (${affected} row(s))`)
    }
  }
}

main()
  .then(() => console.log('done'))
  .catch(err => {
    console.error('failed:', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    clearTimeout(killer)
    await prisma.$disconnect()
  })
