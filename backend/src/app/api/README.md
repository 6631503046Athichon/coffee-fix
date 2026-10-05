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
Every list and by-id read of the chain goes through `chainScope` (`lib/farmAccess`, "each their own", 2026-10-05): Admins see everything (HeadJudges and Cuppers too, cupping is hands-off); a Processor their own batches, those batches' parchment and cherry, the parchment they imported (`externalSource.importedBy`) and their green beans, plus every lot still Ready for Processing; a Roaster the green beans they bought in, hold or roasted plus the shelf (Internal, Available, kg left; never another user's bought-in lot), and parchment / cherry only as the source of those; a Farmer the chain from farms they own or collaborate on; several roles the union. By id, out of scope = 403, missing = 404. A lot's `withdrawalHistory` follows the same split (`greenWithdrawalWhere` / `parchmentWithdrawalWhere`): every row on a lot the reader owns or reads as farmer or processor, but a roaster reading someone else's lot (held, roasted or on the shelf) gets only the rows with `targetRoasterId` = them, never another buyer's kg and dates (bulk-load phase 2, green-bean-lots list and `:id`, parchment-lots list).

| Path | Purpose |
|---|---|
| `harvest-lots/route.ts` | list & create harvest lots. A new lot's `createdById` is its farm's owner (so a lot an Admin records belongs to the farmer), or the caller when there is no farm. Only the farm's owner or an Admin creates one (a collaborator gets 403 "Only the farm owner can register harvest lots on this farm") |
| `harvest-lots/[id]/route.ts` | read / update / delete a harvest lot. Read lists only the batches the reader may read. Owner = `createdById ?? farm.ownerId`; owner and Admin take the owner path, a non-owner Processor the processor path (unprocessed lots only, `?ifUnprocessed=1` guard for the workbench). Owner PUT writes only the keys sent (`updateHarvestLotSchema`, unknown keys dropped); `farmId` null/empty = 400, moving to a farm the caller does not own = 403 (the lot then belongs to the new farm's owner); processed = a batch or parchment lot draws on it: its owner's different `weightKg` or `status` = 409, an Admin may correct `weightKg`, `status` back to Ready = 409 for everyone (a lot only marked Complete by hand is not locked). DELETE of a processed lot = 409 `{ error, dependents: { processingBatches, parchmentLots, greenBeanLots, withdrawals } }`; an Admin's `?cascade=1` deletes it with its whole chain (with `&expect=b,p,g,w`, the counts they saw: a mismatch = 409 with the new counts), anyone else's = 403 |
| `parchment-lots/route.ts` | list & create parchment lots. External parchment records the creator as `externalSource.importedBy` |
| `parchment-lots/[id]/route.ts` | read / update / delete a parchment lot. Read lists only the green lots the reader may read; a reader who may not read the batch (a roaster) gets it as a label (`batchLabel`) |
| `parchment-lots/[id]/withdrawals/route.ts` | record parchment withdrawals (sale / sample / loss / roasting stock). The body is checked with `createParchmentWithdrawalSchema`: a Sale's `salePrice` > 0 with max 2 decimals, `currency` THB/USD/EUR/JPY/CNY, a wrong type = 400; takes `invoiceNumber`. Hull & Grade creates one green bean lot per graded row, owned by the parchment's owner (`processingBatch.createdById`, also when an Admin hulls), takes an optional `gradedLots[i].price` (THB/kg, max 2 decimals, empty or 0 = no price; stamps priceSetDate/priceSetBy and writes a PricingHistory row) and returns the new lots as `greenBeanLots` |
| `parchment-lots/import-excel/route.ts` | bulk import parchment lots from Excel |
| `green-bean-lots/route.ts` | list & create green bean lots. A lot made from parchment belongs to the parchment's owner, also when an Admin records it; an Admin buying a purchased (External) lot for a roaster names them in `ownerId` (an active Roaster, else 400; non-Admin 403) and the lot is theirs |
| `green-bean-lots/[id]/route.ts` | read / update / delete a green bean lot. A reader who may not read the batch (a roaster) gets it as a label (`batchLabel`) |
| `green-bean-lots/[id]/withdrawals/route.ts` | record green bean withdrawals. The body is checked with `createWithdrawalSchema`: a Sale's `salePrice` > 0 with max 2 decimals, `currency` THB/USD/EUR/JPY/CNY, a wrong type = 400 |
| `green-bean-lots/[id]/qr/route.ts` | QR code asset for the lot |
| `green-bean-lots/[id]/generate-public-id/route.ts` | mint the public traceability ID |

## Processing — `processing-batches/`, `process-types/`
| Path | Purpose |
|---|---|
| `processing-batches/route.ts` | list & create processing batches (reads scoped by `chainScope`, see Lots) |
| `processing-batches/[id]/route.ts` | read / update / delete a batch (read: out of scope = 403) |
| `processing-batches/[id]/drying-logs/route.ts` | drying log entries for the batch |
| `process-types/route.ts` | reference list of process types |
| `process-types/[id]/route.ts` | read / update / delete a process type |

## Roaster — `roast-batches/`, `roaster-inventory/`
| Path | Purpose |
|---|---|
| `roast-batches/route.ts` | list & create roast batches |
| `roaster-inventory/route.ts` | list & create (claim) roaster inventory items. Claiming another user's bought-in (External) lot = 403, Admins excepted (`canClaimGreenBeanLot`) |
| `roaster-inventory/[id]/route.ts` | read / update / delete an inventory item. Read gives a roaster the lot's processing batch as a label (`batchLabel`). Raising the claim follows the claim rules (another user's bought-in lot = 403) |

## Sales — `sale-orders/`, `invoices/`, `customers/`, `pricing-history/`
| Path | Purpose |
|---|---|
| `sale-orders/route.ts` | list & create sale orders |
| `sale-orders/[id]/route.ts` | read / update / delete a sale order |
| `invoices/route.ts` | list & create invoices |
| `invoices/[id]/route.ts` | read / update / delete an invoice. Read and update go by the sale's owner (`saleOrder.createdBy`) or Admin, not by who issued the invoice. The read drops the line parchment's `externalSource.importedBy` for anyone but Admin and the importer (`lib/importerPrivacy`) |
| `customers/route.ts` | list & create customers |
| `customers/[id]/route.ts` | read / update / delete a customer |
| `pricing-history/route.ts` | append-only price snapshots. Lists only the prices of lots in the reader's `chainScope` (a Roaster: lots they bought in or hold, not the shelf) |

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
