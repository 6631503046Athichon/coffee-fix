-- Green bean sales: roasters sell green beans from their own stock
-- (RoasterInventoryItem) on the same sales as roasted coffee.
--
-- Apply AFTER 002_roasted_sales.sql and BEFORE deploying the backend that reads this column.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates it.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/003_green_bean_sales.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- Every change is additive and the new column is nullable, so a backend that
-- does not know it keeps working after this runs. Safe to re-run: every statement is guarded.
-- apply-sql-file runs the statements one by one with no transaction. The first
-- statement reads a column that 002 adds, so the file stops before any change if 002 is missing.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

SELECT "roastBatchId" FROM "SaleOrderItem" LIMIT 0;

ALTER TABLE "SaleOrderItem" ADD COLUMN IF NOT EXISTS "roasterInventoryId" TEXT;

CREATE INDEX IF NOT EXISTS "SaleOrderItem_roasterInventoryId_idx" ON "SaleOrderItem" ("roasterInventoryId");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add keeps this re-runnable
ALTER TABLE "SaleOrderItem" DROP CONSTRAINT IF EXISTS "SaleOrderItem_roasterInventoryId_fkey";

ALTER TABLE "SaleOrderItem" ADD CONSTRAINT "SaleOrderItem_roasterInventoryId_fkey" FOREIGN KEY ("roasterInventoryId") REFERENCES "RoasterInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A line sells roasted coffee or green beans, never both. Prisma does not manage CHECK constraints, and db push leaves this one alone
ALTER TABLE "SaleOrderItem" DROP CONSTRAINT IF EXISTS "SaleOrderItem_one_stock_source_check";

ALTER TABLE "SaleOrderItem" ADD CONSTRAINT "SaleOrderItem_one_stock_source_check" CHECK ("roastBatchId" IS NULL OR "roasterInventoryId" IS NULL);

-- Check: expect 5 rows (1 column, 1 index, 1 foreign key, 1 check, then the number of older lines that are neither roasted nor green-from-stock)
SELECT 'column' AS kind, table_name::text || '.' || column_name::text AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'SaleOrderItem' AND column_name = 'roasterInventoryId' UNION ALL SELECT 'index', indexname::text FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'SaleOrderItem_roasterInventoryId_idx' UNION ALL SELECT 'fkey', conname::text FROM pg_constraint WHERE conname = 'SaleOrderItem_roasterInventoryId_fkey' UNION ALL SELECT 'check', conname::text FROM pg_constraint WHERE conname = 'SaleOrderItem_one_stock_source_check' UNION ALL SELECT 'legacy_lines', COUNT(*)::text FROM "SaleOrderItem" WHERE "roastBatchId" IS NULL AND "roasterInventoryId" IS NULL;
