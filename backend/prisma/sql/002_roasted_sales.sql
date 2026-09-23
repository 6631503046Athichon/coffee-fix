-- Roasted coffee sales: sell roast batches to customers and keep a sales log.
--
-- Apply this BEFORE deploying the backend that reads these columns.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates them.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/002_roasted_sales.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- Every change is additive. The backend that is live now never reads the new
-- columns, and soldWeightKg has a default, so it keeps working after this runs.
-- Safe to re-run: every statement is guarded.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

ALTER TABLE "RoastBatch" ADD COLUMN IF NOT EXISTS "soldWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "SaleOrderItem" ADD COLUMN IF NOT EXISTS "roastBatchId" TEXT;

ALTER TABLE "SaleOrder" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;

ALTER TABLE "SaleOrder" ADD COLUMN IF NOT EXISTS "customerAddress" TEXT;

CREATE INDEX IF NOT EXISTS "SaleOrderItem_roastBatchId_idx" ON "SaleOrderItem" ("roastBatchId");

CREATE INDEX IF NOT EXISTS "SaleOrder_createdBy_idx" ON "SaleOrder" ("createdBy");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add keeps this re-runnable
ALTER TABLE "SaleOrderItem" DROP CONSTRAINT IF EXISTS "SaleOrderItem_roastBatchId_fkey";

ALTER TABLE "SaleOrderItem" ADD CONSTRAINT "SaleOrderItem_roastBatchId_fkey" FOREIGN KEY ("roastBatchId") REFERENCES "RoastBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check: expect 8 rows (4 columns, 2 indexes, 1 foreign key, then the number of older green-bean sale lines)
SELECT 'column' AS kind, table_name::text || '.' || column_name::text AS name FROM information_schema.columns WHERE table_schema = current_schema() AND ((table_name = 'RoastBatch' AND column_name = 'soldWeightKg') OR (table_name = 'SaleOrderItem' AND column_name = 'roastBatchId') OR (table_name = 'SaleOrder' AND column_name IN ('customerPhone', 'customerAddress'))) UNION ALL SELECT 'index', indexname::text FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('SaleOrderItem_roastBatchId_idx', 'SaleOrder_createdBy_idx') UNION ALL SELECT 'fkey', conname::text FROM pg_constraint WHERE conname = 'SaleOrderItem_roastBatchId_fkey' UNION ALL SELECT 'legacy_lines', COUNT(*)::text FROM "SaleOrderItem" WHERE "roastBatchId" IS NULL;
