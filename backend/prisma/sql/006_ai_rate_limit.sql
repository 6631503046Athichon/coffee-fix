-- Shared AI rate limit (owner decision D4).
--
-- POST /api/ai/:feature calls Gemini with the backend's key, at most 5 calls a
-- minute per user. The in-memory limiter (lib/rateLimit) counts per server
-- instance, and on Vercel one user's requests spread over several, so the
-- count now also lives on the User row: lib/aiRateLimit takes a call with one
-- guarded UPDATE that every instance shares.
--
-- Apply this BEFORE deploying the backend that reads these columns: Prisma
-- selects every column of a model, so that backend fails on any User read,
-- sign-in included, until they exist.
-- Deploys run `prisma generate`, not `db push`, so nothing else creates them.
-- From backend/ (Node 20.6 or newer):
--   node --env-file=.env.vercel.local scripts/maintenance/apply-sql-file.js prisma/sql/006_ai_rate_limit.sql
-- or paste the whole file into the Supabase SQL Editor.
-- Never copy the production DATABASE_URL into backend/.env
--
-- Both columns are nullable and only the AI route writes them, so the backend
-- that is live now keeps working after this runs. No row is changed: every
-- user starts with both NULL, which the AI route reads as no calls yet. Safe
-- to re-run: every statement is guarded.
-- apply-sql-file splits on a semicolon at the end of a line, so no comment
-- line in this file may end with one

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiWindowStartedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiWindowCalls" INTEGER;

-- Check: expect 2 rows (User.aiWindowCalls integer, User.aiWindowStartedAt timestamp without time zone)
SELECT table_name::text || '.' || column_name::text AS name, data_type::text AS type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'User' AND column_name IN ('aiWindowStartedAt', 'aiWindowCalls') ORDER BY column_name;
