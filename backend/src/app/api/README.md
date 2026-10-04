# API routes

All endpoints follow Next.js App Router conventions: `app/api/<domain>/route.ts`
exports `GET` / `POST` / `PUT` / `DELETE` / `PATCH` functions.

Grouped by domain below. One-liner per route. See `CODEMAP.md` at the repo root
for the visual file tree.

---

## Auth — `auth/`
| Path | Purpose |
|---|---|
| `auth/login/route.ts` | POST credentials, sets httpOnly JWT cookie |
| `auth/logout/route.ts` | POST clears auth cookie |
| `auth/me/route.ts` | GET the current authenticated user |
| `auth/register/route.ts` | POST create a new user (admin-gated) |
| `auth/forgot-password/route.ts` | POST request a password reset email |
| `auth/verify-reset-token/route.ts` | GET validate a reset token |
| `auth/reset-password/route.ts` | POST submit a new password with token |
| `auth/first-login-update/route.ts` | POST forced password / username / email change on first login |

## Farms — `farms/`
| Path | Purpose |
|---|---|
| `farms/route.ts` | list & create farms |
| `farms/[id]/route.ts` | read / update / delete a farm. An Admin's owner change also moves the farm's harvest lots (`createdById`) in the same transaction |
| `farms/[id]/collaborators/route.ts` | manage farm collaborators (FarmCollaborator records) |

## Lots — traceability chain
| Path | Purpose |
|---|---|
| `harvest-lots/route.ts` | list & create harvest lots. A new lot's `createdById` is its farm's owner (so a lot an Admin records belongs to the farmer), or the caller when there is no farm |
| `harvest-lots/[id]/route.ts` | read / update / delete a harvest lot. Owner = `createdById ?? farm.ownerId`; owner and Admin take the owner path, a non-owner Processor the processor path (unprocessed lots only, `?ifUnprocessed=1` guard for the workbench). Owner PUT writes only the keys sent (`updateHarvestLotSchema`, unknown keys dropped); `farmId` null/empty = 400, moving to a farm the caller does not own = 403 (the lot then belongs to the new farm's owner); processed = a batch or parchment lot draws on it: its owner's different `weightKg` or `status` = 409, an Admin may correct `weightKg`, `status` back to Ready = 409 for everyone (a lot only marked Complete by hand is not locked). DELETE of a processed lot = 409 `{ error, dependents: { processingBatches, parchmentLots, greenBeanLots, withdrawals } }`; an Admin's `?cascade=1` deletes it with its whole chain (with `&expect=b,p,g,w`, the counts they saw: a mismatch = 409 with the new counts), anyone else's = 403 |
| `parchment-lots/route.ts` | list & create parchment lots. A farmer-only user (`isFarmerOnly`) lists only parchment from farms they own or collaborate on (`lib/farmAccess`, as bulk-load) |
| `parchment-lots/[id]/route.ts` | read / update / delete a parchment lot. A farmer-only user reads only their farms' lots (403 otherwise) |
| `parchment-lots/[id]/withdrawals/route.ts` | record parchment withdrawals (sale / sample / loss / roasting stock). The body is checked with `createParchmentWithdrawalSchema`: a Sale's `salePrice` > 0 with max 2 decimals, `currency` THB/USD/EUR/JPY/CNY, a wrong type = 400; takes `invoiceNumber`. Hull & Grade creates one green bean lot per graded row, owned by the parchment's owner (`processingBatch.createdById`, also when an Admin hulls), takes an optional `gradedLots[i].price` (THB/kg, max 2 decimals, empty or 0 = no price; stamps priceSetDate/priceSetBy and writes a PricingHistory row) and returns the new lots as `greenBeanLots` |
| `parchment-lots/import-excel/route.ts` | bulk import parchment lots from Excel |
| `green-bean-lots/route.ts` | list & create green bean lots. A farmer-only user lists only green beans hulled from their farms' parchment. A lot made from parchment belongs to the parchment's owner, also when an Admin records it |
| `green-bean-lots/[id]/route.ts` | read / update / delete a green bean lot. A farmer-only user reads only their farms' lots (403 otherwise) |
| `green-bean-lots/[id]/withdrawals/route.ts` | record green bean withdrawals. The body is checked with `createWithdrawalSchema`: a Sale's `salePrice` > 0 with max 2 decimals, `currency` THB/USD/EUR/JPY/CNY, a wrong type = 400 |
| `green-bean-lots/[id]/qr/route.ts` | QR code asset for the lot |
| `green-bean-lots/[id]/generate-public-id/route.ts` | mint the public traceability ID |

## Processing — `processing-batches/`, `process-types/`
| Path | Purpose |
|---|---|
| `processing-batches/route.ts` | list & create processing batches. A farmer-only user lists only batches on their farms' cherry |
| `processing-batches/[id]/route.ts` | read / update / delete a batch. A farmer-only user reads only their farms' batches (403 otherwise) |
| `processing-batches/[id]/drying-logs/route.ts` | drying log entries for the batch |
| `process-types/route.ts` | reference list of process types |
| `process-types/[id]/route.ts` | read / update / delete a process type |

## Roaster — `roast-batches/`, `roaster-inventory/`
| Path | Purpose |
|---|---|
| `roast-batches/route.ts` | list & create roast batches |
| `roaster-inventory/route.ts` | list & create roaster inventory items |
| `roaster-inventory/[id]/route.ts` | read / update / delete an inventory item |

## Sales — `sale-orders/`, `invoices/`, `customers/`, `pricing-history/`
| Path | Purpose |
|---|---|
| `sale-orders/route.ts` | list & create sale orders |
| `sale-orders/[id]/route.ts` | read / update / delete a sale order |
| `invoices/route.ts` | list & create invoices |
| `invoices/[id]/route.ts` | read / update / delete an invoice. Read and update go by the sale's owner (`saleOrder.createdBy`) or Admin, not by who issued the invoice |
| `customers/route.ts` | list & create customers |
| `customers/[id]/route.ts` | read / update / delete a customer |
| `pricing-history/route.ts` | append-only price snapshots. A farmer-only user lists only the prices of green beans from their farms' parchment, as on `green-bean-lots` |

## Farm observations
| Path | Purpose |
|---|---|
| `weather/route.ts` | live weather lookup via external API |
| `weather-records/route.ts` | list & create stored weather records |
| `weather-records/[id]/route.ts` | read / update / delete a weather record |
| `soil-analyses/route.ts` | list & create soil analyses |
| `soil-analyses/[id]/route.ts` | read / update / delete a soil analysis |
| `gap-logs/route.ts` | list & create GAP log entries |
| `gap-logs/[id]/route.ts` | read / update / delete a GAP log entry |

## Reference data
| Path | Purpose |
|---|---|
| `activity-types/route.ts` | list & create activity types |
| `activity-types/[id]/route.ts` | read / update / delete an activity type |
| `coffee-varieties/route.ts` | list & create coffee varieties |
| `coffee-varieties/[id]/route.ts` | read / update / delete a coffee variety |
| `crop-years/route.ts` | list & create crop years |
| `crop-years/[id]/route.ts` | read / update / delete a crop year |

## Cupping — HANDS-OFF (see `CLAUDE.md`)
| Path | Purpose |
|---|---|
| `cupping-sessions/route.ts` | list & create cupping sessions |
| `cupping-sessions/[id]/route.ts` | read / update / delete a session |
| `cupping-sessions/[id]/judges/route.ts` | judges on a session |
| `cupping-sessions/[id]/samples/route.ts` | samples on a session |
| `cupping-sessions/[id]/scores/route.ts` | judge scores |

## Users
| Path | Purpose |
|---|---|
| `users/route.ts` | list & create users |
| `users/[id]/route.ts` | read / update / delete a user |
| `users/transfer-ownership/route.ts` | reassign farms / lots before deleting a user |

## Public / utility
| Path | Purpose |
|---|---|
| `trace/[publicId]/route.ts` | public traceability page data (no auth) |
| `health/route.ts` | health check |
| `bulk-load/route.ts` | dashboard initial-load aggregator (one round-trip) |
| `data-version/route.ts` | cache-busting version stamp |
| `backfill-display-ids/route.ts` | admin migration to populate displayId on legacy rows |

---

## House rules
- Call `requireAuth(request)` first unless the endpoint is intentionally public.
- Validate body / query with the matching schema in `lib/validations/`.
- For resource access, use `requireOwnership(user, ownerId, ['Admin'])` —
  ownership chains are documented in `CLAUDE.md`.
- Return errors via `errorResponse(message, status)` from `lib/middleware.ts`.
