-- OPTIONAL data fix: every roast belongs to the owner of the stock row it was roasted from.
--
-- POST /api/roast-batches records a roast for the stock row's owner
-- (roasterId = the RoasterInventoryItem's roasterId), whoever logs it, so a
-- roast an Admin logs from a roaster's stock lands in that roaster's Roast
-- Logbook, where they can edit, delete and sell it. Roasts an Admin logged
-- before that fix still carry the Admin as roasterId (production has
-- RB-1179, logged by the Admin from roaster1's stock): the roaster cannot
-- see, edit or sell them, and their roasted kg sit in the Admin's sellable
-- list instead. This moves each such roast to its stock row's owner. Only
-- "roasterId" (and "updatedAt", so open pages reload it) changes: the kg,
-- the stock row and the lot stay as they are.
--
-- A roast already on a sale order recorded by someone other than the stock
-- owner is left alone: a sale only takes its seller's roasts, so moving the
-- roast would make that sale impossible to edit. The second check lists
-- those, to settle by hand (cancel and re-record the sale as the roaster, or
-- leave the roast with the seller).
--
-- No schema change. Run from backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/010_roast_owner_backfill.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- Safe to re-run: the UPDATE only touches roasts whose owner still differs
-- from their stock row's, so a second run changes nothing.
--
-- A second, older slip this file only LISTS (last check below): Start roast
-- and Sell on a purchased (External) lot first claim the kg, and an Admin's
-- claim of a roaster's purchased lot used to make an Admin stock row
-- (POST /api/roaster-inventory now fills the lot buyer's row). Such a row and
-- the roasts from it carry the Admin on both sides, so the UPDATE above does
-- not see them, the roaster never sees that stock or roast, and their Delete
-- of the lot is refused for stock they cannot see. These rows are NOT moved
-- here: RoasterInventoryItem is unique on (roasterId, greenBeanLotId), so
-- moving one can collide with the row the roaster already has for that lot.
-- Settle each by hand (move the row when the roaster has none for the lot,
-- else merge the kg and the roasts into the roaster's row).
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

-- Check before: the roasts whose owner is not their stock row's owner (expect RB-1179 on production). label = the RB number the app shows
SELECT rb."id", 'RB-' || lpad(((('x' || substr(replace(rb."id", '-', ''), 1, 8))::bit(32)::bigint) % 10000)::text, 4, '0') AS "label", rb."roastDate", rb."batchSizeKg", rb."roastedWeightKg", rb."soldWeightKg", rb."roasterId" AS "roastOwnerNow", cur."name" AS "roastOwnerNowName", ri."roasterId" AS "stockOwner", own."name" AS "stockOwnerName" FROM "RoastBatch" rb JOIN "RoasterInventoryItem" ri ON ri."id" = rb."roasterInventoryId" LEFT JOIN "User" cur ON cur."id" = rb."roasterId" LEFT JOIN "User" own ON own."id" = ri."roasterId" WHERE rb."roasterId" <> ri."roasterId" ORDER BY rb."roastDate";

-- Check before: sale order lines on those roasts recorded by someone other than the stock owner. These roasts are NOT moved below
SELECT so."orderNumber", so."status", so."createdBy" AS "seller", soi."roastBatchId", soi."quantity", ri."roasterId" AS "stockOwner" FROM "SaleOrderItem" soi JOIN "SaleOrder" so ON so."id" = soi."saleOrderId" JOIN "RoastBatch" rb ON rb."id" = soi."roastBatchId" JOIN "RoasterInventoryItem" ri ON ri."id" = rb."roasterInventoryId" WHERE rb."roasterId" <> ri."roasterId" AND so."createdBy" <> ri."roasterId" ORDER BY so."orderNumber";

-- The fix: each such roast goes to its stock row's owner
UPDATE "RoastBatch" rb SET "roasterId" = ri."roasterId", "updatedAt" = (now() AT TIME ZONE 'UTC') FROM "RoasterInventoryItem" ri WHERE rb."roasterInventoryId" = ri."id" AND rb."roasterId" <> ri."roasterId" AND NOT EXISTS (SELECT 1 FROM "SaleOrderItem" soi JOIN "SaleOrder" so ON so."id" = soi."saleOrderId" WHERE soi."roastBatchId" = rb."id" AND so."createdBy" <> ri."roasterId");

-- Check after: expect 0, or only the roasts the second check listed
SELECT COUNT(*)::int AS "roastsNotWithTheirStockOwner" FROM "RoastBatch" rb JOIN "RoasterInventoryItem" ri ON ri."id" = rb."roasterInventoryId" WHERE rb."roasterId" <> ri."roasterId";

-- Check (list only, nothing is changed): stock rows on a purchased (External) lot held by someone other than the lot's buyer, with the buyer's own row for that lot if they have one (a move would collide with it) and how many roasts each row has
SELECT ri."id" AS "stockRowId", ri."roasterId" AS "stockOwner", holder."name" AS "stockOwnerName", gbl."id" AS "greenBeanLotId", gbl."displayId" AS "lot", gbl."createdById" AS "lotBuyer", buyer."name" AS "lotBuyerName", ri."claimedWeightKg", ri."remainingWeightKg", (SELECT COUNT(*)::int FROM "RoastBatch" rb WHERE rb."roasterInventoryId" = ri."id") AS "roasts", own."id" AS "buyerOwnStockRowId" FROM "RoasterInventoryItem" ri JOIN "GreenBeanLot" gbl ON gbl."id" = ri."greenBeanLotId" LEFT JOIN "User" holder ON holder."id" = ri."roasterId" LEFT JOIN "User" buyer ON buyer."id" = gbl."createdById" LEFT JOIN "RoasterInventoryItem" own ON own."greenBeanLotId" = gbl."id" AND own."roasterId" = gbl."createdById" WHERE gbl."sourceType" = 'External' AND gbl."createdById" IS NOT NULL AND ri."roasterId" <> gbl."createdById" ORDER BY gbl."displayId", ri."id";
