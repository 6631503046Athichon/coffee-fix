-- Sign out other sessions on a password change (audit F30).
--
-- A session is a 24-hour JWT in an httpOnly cookie, and nothing revoked it, so
-- a stolen cookie kept working after the user changed their password. Now
-- every password change (reset by email link, first-login setup, the user's
-- own edit, an Admin's edit or reset) sets User.passwordChangedAt, and
-- requireAuth refuses any token issued before it. The session that made the
-- change gets a fresh cookie, so it stays signed in.
--
-- Apply this BEFORE deploying the backend that reads this column: Prisma
-- selects every column of a model, so that backend fails on any User read,
-- sign-in included, until it exists.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates it.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/007_password_changed_at.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- The column is nullable and the backend that is live now never reads it, so
-- that backend keeps working after this runs. No row is changed: every user
-- starts with NULL, which requireAuth reads as no change yet, so nobody is
-- signed out by the deploy. Safe to re-run: the statement is guarded.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- Check: expect 1 row (User.passwordChangedAt timestamp without time zone)
SELECT table_name::text || '.' || column_name::text AS name, data_type::text AS type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'passwordChangedAt';
