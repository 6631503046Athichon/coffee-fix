-- Withdrawal void and correction (owner decision D7, audit F24).
--
-- A wrong green-bean or parchment withdrawal is voided, never deleted: the
-- void routes put the kg back on the lot (and take them back off the roaster's
-- stock a green-bean push filled) in one transaction and keep the row, marked
-- with voidedAt / voidedById / voidReason. A Hull & Grade void removes the
-- green bean lots it made, so each new lot now records which withdrawal made
-- it (GreenBeanLot.parchmentWithdrawalId), and a green-bean withdrawal records
-- the roaster it pushed kg to (GreenBeanWithdrawal.targetRoasterId). The sale
-- fields stay editable in place, so a parchment withdrawal gets the
-- invoiceNumber column the green-bean one already has.
--
-- Apply this BEFORE deploying the backend that reads these columns: Prisma
-- selects every column of a model, so that backend fails on any withdrawal or
-- green bean lot read until they exist.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates them.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/005_withdrawal_void.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- Every change is additive and every new column is nullable, so the backend
-- that is live now keeps working after this runs. No row is changed: rows
-- recorded before this file have the new columns NULL, and the void routes
-- handle them (see backend/prisma/README.md). Safe to re-run: every statement is guarded.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

ALTER TABLE "GreenBeanWithdrawal" ADD COLUMN IF NOT EXISTS "targetRoasterId" TEXT;

ALTER TABLE "GreenBeanWithdrawal" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);

ALTER TABLE "GreenBeanWithdrawal" ADD COLUMN IF NOT EXISTS "voidedById" TEXT;

ALTER TABLE "GreenBeanWithdrawal" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

ALTER TABLE "ParchmentWithdrawal" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;

ALTER TABLE "ParchmentWithdrawal" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);

ALTER TABLE "ParchmentWithdrawal" ADD COLUMN IF NOT EXISTS "voidedById" TEXT;

ALTER TABLE "ParchmentWithdrawal" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

ALTER TABLE "GreenBeanLot" ADD COLUMN IF NOT EXISTS "parchmentWithdrawalId" TEXT;

CREATE INDEX IF NOT EXISTS "GreenBeanLot_parchmentWithdrawalId_idx" ON "GreenBeanLot" ("parchmentWithdrawalId");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add keeps this re-runnable
ALTER TABLE "GreenBeanWithdrawal" DROP CONSTRAINT IF EXISTS "GreenBeanWithdrawal_voidedById_fkey";

ALTER TABLE "GreenBeanWithdrawal" ADD CONSTRAINT "GreenBeanWithdrawal_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ParchmentWithdrawal" DROP CONSTRAINT IF EXISTS "ParchmentWithdrawal_voidedById_fkey";

ALTER TABLE "ParchmentWithdrawal" ADD CONSTRAINT "ParchmentWithdrawal_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GreenBeanLot" DROP CONSTRAINT IF EXISTS "GreenBeanLot_parchmentWithdrawalId_fkey";

ALTER TABLE "GreenBeanLot" ADD CONSTRAINT "GreenBeanLot_parchmentWithdrawalId_fkey" FOREIGN KEY ("parchmentWithdrawalId") REFERENCES "ParchmentWithdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Check: expect 15 rows (9 columns, 1 index, 3 foreign keys, then 2 counts of older rows the void routes work out from the lot: roasting_stock_without_roaster, hull_and_grade_without_lot_link)
SELECT 'column' AS kind, table_name::text || '.' || column_name::text AS name FROM information_schema.columns WHERE table_schema = current_schema() AND ((table_name = 'GreenBeanWithdrawal' AND column_name IN ('targetRoasterId', 'voidedAt', 'voidedById', 'voidReason')) OR (table_name = 'ParchmentWithdrawal' AND column_name IN ('invoiceNumber', 'voidedAt', 'voidedById', 'voidReason')) OR (table_name = 'GreenBeanLot' AND column_name = 'parchmentWithdrawalId')) UNION ALL SELECT 'index', indexname::text FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'GreenBeanLot_parchmentWithdrawalId_idx' UNION ALL SELECT 'fkey', conname::text FROM pg_constraint WHERE conname IN ('GreenBeanWithdrawal_voidedById_fkey', 'ParchmentWithdrawal_voidedById_fkey', 'GreenBeanLot_parchmentWithdrawalId_fkey') UNION ALL SELECT 'roasting_stock_without_roaster', COUNT(*)::text FROM "GreenBeanWithdrawal" WHERE "withdrawalType" = 'RoastingStock' AND "targetRoasterId" IS NULL UNION ALL SELECT 'hull_and_grade_without_lot_link', COUNT(*)::text FROM "ParchmentWithdrawal" w WHERE w."withdrawalType" = 'HullAndGrade' AND NOT EXISTS (SELECT 1 FROM "GreenBeanLot" g WHERE g."parchmentWithdrawalId" = w."id");
