# Coffee Lab Platform — Working Notes

## Hands-off areas

- **Cupping** — do not modify any cupping-related code without an explicit
  request from the user. This includes:
  - `backend/src/app/api/cupping-sessions/**`
  - `backend/src/app/api/.../cuppingScore*` related fields
  - `frontend/src/components/cupper/**`
  - Prisma models: `CuppingSession`, `CuppingSample`, `JudgeScore`,
    `CuppingSessionJudge`, `CuppingScore`
  - Even when a security audit or refactor would touch these files,
    flag the issue and ask before changing anything in cupping.

## Project layout

- **backend/** — Next.js 14 App Router + Prisma + PostgreSQL (Railway)
- **frontend/** — Vite + React 19 SPA (TypeScript, non-strict)
- Two separate package.json roots, not a monorepo tooling setup

## Conventions

- Single quotes, no semicolons (matches existing code; conflicts with the
  `Coffee_Lab_Platform_Coding_Standards.docx` — code wins for now)
- Commit messages: Conventional Commits (`fix:`, `feat:`, `refactor:` …)
- **Never** add `Co-Authored-By: Claude …` lines to commits — user has
  asked for this explicitly multiple times
- TypeScript strict mode is on for backend, off for frontend
- Auth: JWT in httpOnly cookie + bcrypt + zod validation
- Ownership chain pattern for BOLA checks:
  - `parchmentLot → processingBatch.createdById`
  - `greenBeanLot.createdById`
  - `processingBatch.createdById`
  - `harvestLot.createdById` or `farm.ownerId`
  - Use `requireOwnership(user, ownerId, ['Admin'])` from `lib/middleware`
