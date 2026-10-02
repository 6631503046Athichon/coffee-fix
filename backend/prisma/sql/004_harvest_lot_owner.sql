-- Harvest lot owner: a lot on a farm belongs to that farm's owner.
--
-- POST /api/harvest-lots never stored createdById, so every older lot has it
-- NULL and its owner farmer got 403 on edit and delete. The backend now reads
-- a lot's owner as createdById, falling back to its farm's owner, and stores
-- the farm's owner on new lots (a lot an Admin records for a farmer belongs to
-- that farmer). This fills the older lots the same way, so the column says
-- what the backend already decides.
--
-- No schema change: the column exists. The backend works before and after
-- this runs (it falls back to the farm's owner), so it can be applied before
-- or after the deploy. Safe to re-run: it only fills rows that are still NULL.
-- Lots with no farm keep a NULL owner, so only an Admin can edit or delete
-- them. checks/004_harvest_lot_damage_check.sql lists those.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/004_harvest_lot_owner.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

UPDATE "HarvestLot" h SET "createdById" = f."ownerId" FROM "Farm" f WHERE h."farmId" = f."id" AND h."createdById" IS NULL;

-- Check: expect 3 rows. owned = lots with an owner, on_farm_without_owner = expect 0, no_farm = lots only an Admin can change
SELECT 'owned' AS kind, COUNT(*)::text AS lots FROM "HarvestLot" WHERE "createdById" IS NOT NULL UNION ALL SELECT 'on_farm_without_owner', COUNT(*)::text FROM "HarvestLot" WHERE "farmId" IS NOT NULL AND "createdById" IS NULL UNION ALL SELECT 'no_farm', COUNT(*)::text FROM "HarvestLot" WHERE "farmId" IS NULL;
