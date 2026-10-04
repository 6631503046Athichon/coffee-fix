-- Processor QC notes on a green bean lot.
--
-- The QC Score popup on the Processor workbench has a "Tasting Notes &
-- Comments" box, but the notes were only kept in the browser: the backend had
-- no column for them, so they were gone after a reload. They are now saved
-- with the QC score (PATCH /api/green-bean-lots/:id) in GreenBeanLot.qcNotes
-- and come back with the lot, so the popup opens on them again. This is the
-- processor's own QC note, not a cupping-session column.
--
-- Apply this BEFORE deploying the backend that reads this column: Prisma
-- selects every column of a model, so that backend fails on any green bean
-- lot read until it exists.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates it.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/008_green_bean_qc_notes.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- The column is nullable and the backend that is live now never reads it, so
-- that backend keeps working after this runs. No row is changed: every lot
-- starts with NULL (no notes). Safe to re-run: the statement is guarded.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

ALTER TABLE "GreenBeanLot" ADD COLUMN IF NOT EXISTS "qcNotes" TEXT;

-- Check: expect 1 row (GreenBeanLot.qcNotes text)
SELECT table_name::text || '.' || column_name::text AS name, data_type::text AS type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'GreenBeanLot' AND column_name = 'qcNotes';
