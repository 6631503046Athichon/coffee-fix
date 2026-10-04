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
- `handleApiError(error)` — the catch-all. Known Prisma codes and auth errors
  get their status; an error with a 4xx `statusCode` answers that status with
  its message (throw `Object.assign(new Error(msg), { statusCode: 409 })` for
  one the client should see); anything else, a bare `SyntaxError` included,
  is a generic 500 with the detail kept in the server log. A route that wants
  a 400 for a body that is not JSON catches `request.json()` itself.
- `errorResponse(message, status)` / `successResponse(data, status)` — JSON helpers.

## `prisma.ts`
Prisma client singleton. Re-uses the same instance across Next.js hot-reloads
to avoid connection-pool exhaustion in dev.

## `trace.ts`
The public traceability story of a green bean lot.
- `publicTraceSelect` — the Prisma select behind it. It is served without auth,
  so it must never read inventory, PII or internal free-text fields (no
  `processNotes`).
- `serializePublicTrace(lot, traceId)` — the response body. Used by the public
  `trace/[publicId]` route and the staff `green-bean-lots/[id]/trace-preview`
  route, so a preview matches what customers will see. A bought-in lot's
  `externalSource` keeps only `PUBLIC_EXTERNAL_SOURCE_KEYS` (origin, producer,
  variety, process, purchase date, taste note): never the price paid,
  currency or supplier notes.

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

## `saleOrders.ts` — selling roasted coffee and green beans
Type-only imports, so routes and tests can use it without mocks.
- `saleOrderInclude` / `serializeSaleOrder(o)` and `roastSummarySelect` /
  `serializeRoastSummary(b)` — the sale JSON every sale route returns
- `greenStockSelect` / `serializeGreenStock(row)` — a stock row
  (`RoasterInventoryItem`) as a green-bean sale line and
  `roaster-inventory/sellable` show it; `lotFacts(lot)` gives the grade,
  variety and process both summaries share
- `priceLines(items, batchById, stockById)` — server-side line amounts (kg to
  3 dp, money to 2 dp); client subtotals are never read, and the lot and grade
  come from the roast or the stock row
- `checkSaleBatches` / `checkSaleStock` — every roast and stock row on a sale
  exists and belongs to the sale's owner (`createdBy`). On create the owner is
  the caller, or the roaster an Admin names in `sellerId`; an Admin never sells
  another roaster's coffee in their own name
- `reservationsByBatch(status, lines)` + `applyReservationChange(tx, old, new)` —
  move `RoastBatch.soldWeightKg` with one guarded SQL `UPDATE` per roast, in id
  order, inside the sale's transaction. Throws `StockError` when a roast has
  too little left
- `reservationsByInventory(status, lines)` +
  `applyGreenReservationChange(tx, old, new, ownerId)` — take and return
  `RoasterInventoryItem.remainingWeightKg` with one guarded raw `UPDATE` per
  stock row, after the roasts; never bumps `updatedAt`; throws
  `GreenStockError`
- `isAdminUser`, `canSeeSales`, `roastBatchLabel` (same as the frontend's
  `toRoastBatchId`), `roaLabel` (same as the frontend's `toRoaId`),
  `firstIssueMessage`, `saleErrorResponse`

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
| Change a roast's sold kg | `applyReservationChange` from `./saleOrders` (never write `soldWeightKg` directly) |
| Take or return green kg for a sale | `applyGreenReservationChange` from `./saleOrders` (never write `remainingWeightKg` from a sale route directly) |
