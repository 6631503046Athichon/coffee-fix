-- Document numbers are never handed out twice.
--
-- Lot and batch display ids (HL, PB, PCH, GBL) and sale order and invoice
-- numbers (ORD, INV) were the highest number in the table plus one, so
-- deleting the newest record gave its number to the next one: HL-2026-8,
-- GBL-2026-8 and ORD-2026-0002 were each handed out twice, and a printed
-- label or receipt with that number then meant two different records.
-- The backend now keeps the last number of each series (key = prefix and
-- year, e.g. HL-2026 or ORD-2026) in "DocumentSequence" and takes the next
-- one with a single INSERT ... ON CONFLICT DO UPDATE (lib/documentSequence),
-- never below the highest number still in the table.
--
-- Apply this BEFORE deploying the backend that uses the table: that backend
-- cannot create a lot, batch, sale order or invoice until it exists.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates it.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/009_document_sequences.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- Additive: one new table, no existing row is changed, and the backend that
-- is live now never reads it, so it keeps working after this runs. The seed
-- statements start every series at the highest number its table holds now,
-- so a record deleted after this runs never gets its number reused, even
-- before the new backend makes its first record of that series. A number
-- deleted BEFORE this runs is gone from the table and cannot be known, so it
-- can still be handed out once more if it was the highest of its series.
-- Safe to re-run: the table is created only if missing, and the seed only
-- ever raises a counter (GREATEST), never lowers one.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

CREATE TABLE IF NOT EXISTS "DocumentSequence" (
    "key"       TEXT         NOT NULL,
    "lastValue" INTEGER      NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("key")
);

-- Seed from the lots and batches: HL-2026-7 -> key HL-2026, lastValue 7.
-- Ids that are not PREFIX-YYYY-N are skipped, as the backend skips them.
INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
SELECT substring("displayId" from '^([A-Z]+-[0-9]{4})-[0-9]{1,9}$'), MAX(substring("displayId" from '^[A-Z]+-[0-9]{4}-([0-9]{1,9})$')::integer), (now() AT TIME ZONE 'UTC')
FROM "HarvestLot" WHERE "displayId" ~ '^[A-Z]+-[0-9]{4}-[0-9]{1,9}$' GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue", EXCLUDED."lastValue"), "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
SELECT substring("displayId" from '^([A-Z]+-[0-9]{4})-[0-9]{1,9}$'), MAX(substring("displayId" from '^[A-Z]+-[0-9]{4}-([0-9]{1,9})$')::integer), (now() AT TIME ZONE 'UTC')
FROM "ProcessingBatch" WHERE "displayId" ~ '^[A-Z]+-[0-9]{4}-[0-9]{1,9}$' GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue", EXCLUDED."lastValue"), "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
SELECT substring("displayId" from '^([A-Z]+-[0-9]{4})-[0-9]{1,9}$'), MAX(substring("displayId" from '^[A-Z]+-[0-9]{4}-([0-9]{1,9})$')::integer), (now() AT TIME ZONE 'UTC')
FROM "ParchmentLot" WHERE "displayId" ~ '^[A-Z]+-[0-9]{4}-[0-9]{1,9}$' GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue", EXCLUDED."lastValue"), "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
SELECT substring("displayId" from '^([A-Z]+-[0-9]{4})-[0-9]{1,9}$'), MAX(substring("displayId" from '^[A-Z]+-[0-9]{4}-([0-9]{1,9})$')::integer), (now() AT TIME ZONE 'UTC')
FROM "GreenBeanLot" WHERE "displayId" ~ '^[A-Z]+-[0-9]{4}-[0-9]{1,9}$' GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue", EXCLUDED."lastValue"), "updatedAt" = EXCLUDED."updatedAt";

-- Seed from the sale orders and invoices: ORD-2026-0002 -> key ORD-2026, lastValue 2.
INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
SELECT substring("orderNumber" from '^([A-Z]+-[0-9]{4})-[0-9]{1,9}$'), MAX(substring("orderNumber" from '^[A-Z]+-[0-9]{4}-([0-9]{1,9})$')::integer), (now() AT TIME ZONE 'UTC')
FROM "SaleOrder" WHERE "orderNumber" ~ '^[A-Z]+-[0-9]{4}-[0-9]{1,9}$' GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue", EXCLUDED."lastValue"), "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "DocumentSequence" ("key", "lastValue", "updatedAt")
SELECT substring("invoiceNumber" from '^([A-Z]+-[0-9]{4})-[0-9]{1,9}$'), MAX(substring("invoiceNumber" from '^[A-Z]+-[0-9]{4}-([0-9]{1,9})$')::integer), (now() AT TIME ZONE 'UTC')
FROM "Invoice" WHERE "invoiceNumber" ~ '^[A-Z]+-[0-9]{4}-[0-9]{1,9}$' GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue", EXCLUDED."lastValue"), "updatedAt" = EXCLUDED."updatedAt";

-- Check: expect one row per series that has records (e.g. HL-2026, GBL-2026, ORD-2026), lastValue = its highest number
SELECT "key", "lastValue", "updatedAt" FROM "DocumentSequence" ORDER BY "key";
