# Backend src/ — overview

This is the Next.js 14 App Router source tree. Two top-level concerns live here.

## `app/`
HTTP entrypoints only. Every `app/api/<domain>/route.ts` exports HTTP method
handlers (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`). No business logic should
live inline — call into `lib/` helpers and Prisma.

See `app/api/README.md` for the full endpoint catalogue.

## `lib/`
Reusable building blocks shared across routes:

- `auth.ts` — JWT sign / verify, password hashing
- `middleware.ts` — `requireAuth`, `requireRole`, `requireOwnership`
- `prisma.ts` — Prisma client singleton
- `validations/` — Zod schemas per domain
- `utils.ts` — safe parsers, display-ID generation
- `rateLimit.ts`, `email.ts`, `documentNumbers.ts`, `credentialGenerator.ts`

See `lib/README.md` for what each helper does and when to use it.

## `middleware.ts` (edge)
Next.js edge middleware (runs before route handlers — usually CORS / rate
limit / cookie passthrough). NOT the same as `lib/middleware.ts` which
provides per-handler auth helpers.

## Conventions
- Single quotes, no semicolons.
- TypeScript strict mode is on for backend.
- Always validate request bodies with Zod from `lib/validations/`.
- Always call `requireAuth` (or `optionalAuth`) at the top of a handler
  unless the route is intentionally public (`trace/`, `health/`).
- For resource access, follow up with `requireOwnership(user, ownerId, ['Admin'])`
  using the ownership chain documented in `CLAUDE.md`.
