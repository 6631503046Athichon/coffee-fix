-- Read-only: harvest lots that the old edit bug may have damaged.
--
-- Before the fix that ships with 004_harvest_lot_owner.sql, editing a lot sent
-- every field, filling the ones the form left out with blanks: no farm, no crop
-- year, weight 0, empty variety, farmer name or plot, status Ready. The lot
-- page could also save such a lot by itself when it opened. This lists the
-- lots that still carry one of those marks, to repair in the Data Hub edit:
-- an Admin can set any lot's farm, crop year, weight (a processed lot's too)
-- and text fields, the owner their own lots except a processed lot's weight.
-- Lots with no farm show to Admins only. readyButProcessed = status says Ready
-- although the lot already has a batch or parchment lot: the bug, or an older
-- lot from the partial-weight flow (the app reads a lot with a batch as
-- Complete either way). A NULL crop year
-- is shown but is not a mark on its own, since a lot may have none. A lot moved
-- onto another farmer's farm with the same location cannot be told apart from
-- the data alone: compare its farm with its farmer name.
--
-- Run from backend/ with the same command as the schema files, e.g.
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/checks/004_harvest_lot_damage_check.sql
-- or paste it into the Supabase SQL Editor. It only SELECTs, so it is safe to
-- run at any time, before or after 004.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

-- Summary: how many lots carry each mark (a lot can carry several)
SELECT COUNT(*) FILTER (WHERE h."farmId" IS NULL)::int AS "noFarm", COUNT(*) FILTER (WHERE h."weightKg" = 0)::int AS "zeroWeight", COUNT(*) FILTER (WHERE h."cherryVariety" = '')::int AS "blankVariety", COUNT(*) FILTER (WHERE h."farmerName" = '')::int AS "blankFarmerName", COUNT(*) FILTER (WHERE h."farmPlotLocation" = '')::int AS "blankPlot", COUNT(*) FILTER (WHERE h."status" = 'ReadyForProcessing' AND (EXISTS (SELECT 1 FROM "ProcessingBatch" b WHERE b."harvestLotId" = h."id") OR EXISTS (SELECT 1 FROM "ParchmentLot" p WHERE p."harvestLotId" = h."id")))::int AS "readyButProcessed", COUNT(*)::int AS "lotsInTotal" FROM "HarvestLot" h;

-- The lots, most recently changed first. hasBatches = it was processed, so a wrong weight there also sits in the traceability chain
SELECT h."id", h."displayId", h."farmerName", h."cherryVariety", h."weightKg", h."farmPlotLocation", h."status", h."farmId", h."cropYearId", h."createdAt", h."updatedAt", EXISTS (SELECT 1 FROM "ProcessingBatch" b WHERE b."harvestLotId" = h."id") AS "hasBatches", EXISTS (SELECT 1 FROM "ParchmentLot" p WHERE p."harvestLotId" = h."id") AS "hasParchment", (h."farmId" IS NULL) AS "noFarm", (h."weightKg" = 0) AS "zeroWeight", (h."cherryVariety" = '') AS "blankVariety", (h."farmerName" = '') AS "blankFarmerName", (h."farmPlotLocation" = '') AS "blankPlot" FROM "HarvestLot" h WHERE h."farmId" IS NULL OR h."weightKg" = 0 OR h."cherryVariety" = '' OR h."farmerName" = '' OR h."farmPlotLocation" = '' OR (h."status" = 'ReadyForProcessing' AND (EXISTS (SELECT 1 FROM "ProcessingBatch" b WHERE b."harvestLotId" = h."id") OR EXISTS (SELECT 1 FROM "ParchmentLot" p WHERE p."harvestLotId" = h."id"))) ORDER BY h."updatedAt" DESC;
