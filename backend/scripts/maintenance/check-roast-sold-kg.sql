-- Read-only: roasts whose sold counter does not match their sale lines. Expect 0 rows
--
-- Run from backend/ with the same command as the schema files, e.g.
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js scripts/maintenance/check-roast-sold-kg.sql
-- It only SELECTs, so it is safe to run at any time.
SELECT rb."id", rb."roastedWeightKg", rb."soldWeightKg", COALESCE(s.kg, 0) AS "expectedKg" FROM "RoastBatch" rb LEFT JOIN (SELECT i."roastBatchId", SUM(i."quantity") AS kg FROM "SaleOrderItem" i JOIN "SaleOrder" o ON o."id" = i."saleOrderId" WHERE o."status" <> 'Cancelled' AND i."roastBatchId" IS NOT NULL GROUP BY i."roastBatchId") s ON s."roastBatchId" = rb."id" WHERE ABS(rb."soldWeightKg" - COALESCE(s.kg, 0)) > 0.0005 OR rb."soldWeightKg" > COALESCE(rb."roastedWeightKg", 0) + 0.0005;
