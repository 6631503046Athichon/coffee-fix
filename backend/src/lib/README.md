# Backend `lib/` — shared helpers

These modules are the building blocks every API route relies on. Import from here
instead of duplicating logic inline in `route.ts` handlers.

## `auth.ts`
JWT and password primitives.
- `hashPassword(password)` / `verifyPassword(password, hash)` — bcrypt wrappers
- `generateToken(payload)` / `verifyToken(token)` — JWT sign / verify
- `extractToken(request)` — pull JWT from the httpOnly cookie or `Authorization` header
- `JWTPayload` — token shape

## `middleware.ts` — auth gate (USE THIS IN EVERY HANDLER)
- `requireAuth(request)` — throws `Unauthorized` if no valid JWT. Returns the
  cached `AuthenticatedUser`. 10-second in-memory cache to absorb page-load
  bursts; revocation latency is capped at 10s by design.
- `requireRole(user, allowedRoles)` — throws `Insufficient permissions` if the
  user doesn't hold one of the allowed roles (super admins always pass).
- `requireOwnership(user, ownerId, allowedRoles = ['Admin'])` — BOLA guard.
  Throws unless the user is the owner, a super admin, or holds an allowed role.
  Follow the ownership chain from `CLAUDE.md`:
  - `parchmentLot → processingBatch.createdById`
  - `greenBeanLot.createdById`
  - `processingBatch.createdById`
  - `harvestLot.createdById` or `farm.ownerId`
- `optionalAuth(request)` — returns user or null (use for endpoints that behave
  differently for guests, like `trace/[publicId]`).
- `errorResponse(message, status)` / `successResponse(data, status)` — JSON helpers.

## `prisma.ts`
Prisma client singleton. Re-uses the same instance across Next.js hot-reloads
to avoid connection-pool exhaustion in dev.

## `validations/`
Zod schemas, one file per domain (`farm`, `harvestLot`, `parchmentLot`,
`greenBeanLot`, `processingBatch`, `roasting`, `sales`, `gapLog`,
`soilAnalysis`, `weatherRecord`, `cupping`, `user`, `cropYear`,
`referenceData`, `middleware`, `common`). Re-export via `index.ts`. Always
`schema.safeParse(body)` rather than trusting client input.

## `utils.ts` — parsers & display IDs
- `safeParseFloat(value)` / `safeParseInt(value)` — coerce unknown input to a
  number, returning `null` for empty / non-numeric input. Prevents `NaN`
  leaking into Prisma writes (see `safe-parsing.test.ts`).
- `parseDateOnly(value)` — turn `YYYY-MM-DD` into a `Date` anchored at 12:00 UTC
  so the calendar date is stable in every timezone (see `parse-date-only.test.ts`).
- `nextDisplayId(model, prefix)` — compute the next `PREFIX-YYYY-N` ID.
- `nextDisplayIds(model, prefix, count)` — batch variant.
- `withDisplayIdRetry(fn)` — wrap a `nextDisplayId + create` pair so a P2002
  unique-violation triggers a retry rather than a 500. ALWAYS use this when
  inserting a row that has a `displayId`.

## `rateLimit.ts`
In-memory rate limiter keyed by IP / user. Lives in process memory so a deploy
resets it — fine for our scale.

## `email.ts`
Nodemailer setup + templates. Used by the password-reset flow.

## `credentialGenerator.ts`
Generate temporary username / password for admin-created users (`first-login`
flow forces a change).

## `documentNumbers.ts`
Sale-order and invoice number formatting.

---

## Quick-import map

| Need… | Import from |
|---|---|
| Reject unauthenticated requests | `requireAuth` from `./middleware` |
| Reject non-admin requests | `requireRole` from `./middleware` |
| Reject access to someone else's data | `requireOwnership` from `./middleware` |
| Validate a request body | `lib/validations/<domain>` |
| Coerce a number safely | `safeParseFloat` / `safeParseInt` from `./utils` |
| Parse a date-only string safely | `parseDateOnly` from `./utils` |
| Insert with a `displayId` | `withDisplayIdRetry(() => …)` from `./utils` |
| Query the DB | `prisma` from `./prisma` |
