# Prisma — data model index

Single source of truth: `schema.prisma`. Seed in `seed.ts`.

Schema changes ship as hand-written SQL in `prisma/sql/` (`001_…`, `002_…`, … `009_…`),
because deploys run `prisma generate` and never push the schema. Apply a file
to the database **before** deploying the backend that reads it, from
`backend/`:

```
node --env-file=<env file> scripts/maintenance/apply-sql-file.js prisma/sql/<file>.sql
```

or paste it into the Supabase SQL Editor. Keep every statement guarded
(`IF NOT EXISTS`, drop-then-add for constraints) so a file is safe to re-run,
and never let a comment line end with a semicolon (`apply-sql-file.js` splits
on them). Match Prisma's names (`<Model>_<field>_idx`, `<Model>_<field>_fkey`)
so a later `db push` sees no drift. `npx prisma db push` is for a local
database only. `npx prisma studio` inspects data.

Data fixes ship the same way. `sql/004_harvest_lot_owner.sql` is one: no schema
change, it fills `HarvestLot.createdById` with the farm's owner on lots that have
none (older lots were all saved without it), then counts what is left. It can
run before or after the deploy, because the backend already falls back to the
farm's owner, and it is safe to re-run.

`sql/005_withdrawal_void.sql` (owner decision D7) adds nullable columns only, so
the live backend keeps working once it has run; apply it **before** the backend
that reads them, which fails on any withdrawal or green bean lot read until
they exist:

- `GreenBeanWithdrawal` and `ParchmentWithdrawal`: `voidedAt`, `voidedById`
  (FK to `User`, `ON DELETE SET NULL`) and `voidReason`. A wrong withdrawal is
  voided, never deleted or re-weighed: `POST /api/<green-bean-lots|parchment-lots>/:id/withdrawals/:withdrawalId/void`
  puts its kg back on the lot in one transaction and keeps the row, marked.
- `GreenBeanWithdrawal.targetRoasterId`: the roaster whose `RoasterInventoryItem`
  the kg went into, so a void takes them back off that row (refused with 409
  once the roaster's `remainingWeightKg` no longer holds them). An older
  Roasting Stock row has it NULL; its void uses the lot's one stock row and is
  refused when there are several or none.
- `GreenBeanLot.parchmentWithdrawalId` (FK, `ON DELETE SET NULL`, indexed): the
  Hull & Grade that made the lot. Voiding a Hull & Grade deletes the lots it
  made, and is refused (409) if any of them was used in any way (withdrawn,
  claimed, roasted, sold, invoiced, cupped, re-weighed, taken off the market or
  given a trace QR). Lots hulled before 005 have it NULL and are matched by
  parchment lot and creation time; when that is ambiguous the void is refused.
- `ParchmentWithdrawal.invoiceNumber`, so both withdrawal kinds have the same
  sale paperwork. `PATCH /api/<…>/withdrawals/:withdrawalId` edits only
  `customerName`, `deliveryAddress`, `salePrice`, `currency` and
  `invoiceNumber` in place; the server recomputes `totalAmount`.

Every list returns the void columns. Non-owners see `voidedAt` and `voidedById`
(see `lib/withdrawalPrivacy`); `voidReason` is free text, so it stays private
with the sale. Anything that adds up withdrawals must skip rows with
`voidedAt` set: their kg are already back on the lot.

`sql/006_ai_rate_limit.sql` (owner decision D4) adds two nullable columns to
`User`: `aiWindowStartedAt` and `aiWindowCalls`, the user's shared count of AI
calls (`POST /api/ai/:feature`, `lib/aiRateLimit`). One guarded `UPDATE`
starts a new one-minute window or adds a call while the user is under the
limit, so every server instance shares it (the in-memory limiter counts per
instance). Raw SQL, so `User.updatedAt` does not move. NULL means no calls
yet. Apply it **before** the backend that reads them: until they exist, every
`User` read fails, sign-in included.

`sql/007_password_changed_at.sql` (audit F30) adds one nullable column to
`User`: `passwordChangedAt`. Every password change sets it: the email reset
(`auth/reset-password`), first-login setup (`auth/first-login-update`), and
`PUT /api/users/:id` (the user's own change and an Admin's edit or reset).
`requireAuth` (`lib/middleware`) refuses a token whose `iat` is before it,
compared in whole seconds as `iat` is, so a change signs out every other
session and a stolen cookie stops working. The session that made the change
gets a fresh cookie (`refreshSessionCookie`) and stays signed in; an Admin
resetting someone else's password keeps their own session, and that user
must pick their own password at next sign-in (`mustChangePassword`). An
Admin who sets their own password through the Admin edit (User Management)
keeps the session and is not sent to first-login setup. The 10 s auth
cache keeps the column too and is dropped on the instance that saved the
change; another instance may still accept an older token for up to 10 s.
NULL means no change since the column was added, so the deploy signs nobody
out. Apply it **before** the backend that reads it: until it exists, every
`User` read fails, sign-in included.

`sql/008_green_bean_qc_notes.sql` adds one nullable text column to
`GreenBeanLot`: `qcNotes`, the processor's QC "Tasting Notes & Comments".
`PATCH /api/green-bean-lots/:id` saves it with the QC score (trimmed, at most
2000 characters, empty = NULL; same owner-or-Admin rule as the score) and every
lot read returns it, so the QC Score popup opens on it again. It is not a
cupping-session column. NULL means no notes. Apply it **before** the backend
that reads it: until it exists, every `GreenBeanLot` read fails.

`sql/009_document_sequences.sql` adds the `DocumentSequence` table: the last
number handed out per series (`HL-2026`, `PB-2026`, `PCH-2026`, `GBL-2026`,
`ORD-2026`, `INV-2026`), so a deleted record's number is never handed out
again (it was: HL-2026-8, GBL-2026-8 and ORD-2026-0002 were each used twice).
It also seeds every series with the highest number its table holds, never
lowering a counter, so it is safe to re-run. The live backend never reads the
table, so it keeps working once it has run; apply it **before** the backend
that uses it, which cannot create a lot, batch, sale order or invoice until it
exists. A number deleted before it runs cannot be known and may be used once
more.

Read-only reports live in `prisma/sql/checks/` and run with the same command;
they only `SELECT`, so they are safe at any time.
`checks/004_harvest_lot_damage_check.sql` lists the harvest lots the old edit
bug may have blanked (no farm, weight 0, empty variety, farmer name or plot,
or status back to Ready on a lot that already has a batch or parchment lot),
newest change first, with whether each lot has batches. They are repaired in
the Data Hub edit: an Admin can set any lot's farm, crop year, weight (also on
a processed lot) and text fields; the owner can repair their own lots, except
the weight of a processed one. Lots with no farm are visible to Admins only.

## Model index

### Identity & access
| Model | Purpose |
|---|---|
| `User` | account, roles (`UserRole[]`), `isSuperAdmin`, must-change-* flags. `aiWindowStartedAt` / `aiWindowCalls` = the shared AI call count (`sql/006_ai_rate_limit`). `passwordChangedAt` = last password change; tokens issued before it are refused (`sql/007_password_changed_at`) |
| `PasswordResetToken` | one-shot reset tokens for `auth/reset-password` |
| `FarmCollaborator` | join row giving a non-owner user access to a farm |

### Farms & observations
| Model | Purpose |
|---|---|
| `Farm` | farm metadata, `ownerId`, varieties, weather auto-fetch settings |
| `WeatherRecord` | stored weather observations tied to a farm |
| `SoilAnalysis` | soil test results tied to a farm |
| `GAPLogEntry` | GAP / activity log entries tied to a farm |

### Lots — the traceability spine
| Model | Purpose |
|---|---|
| `HarvestLot` | raw cherry harvested from a farm. `createdById` = the owner (the farm's owner, also when an Admin records or moves the lot), `farmId` (required on edit: a lot stays on a farm). `weightKg` preserves the original input; old `remainingWeightKg` partial balances are ignored. A farm owner change in `farms/[id]` moves `createdById` of the farm's lots too. Once processed (any batch or parchment lot) its `status` stays `Complete`, only an Admin can correct its `weightKg`, and deleting it needs an Admin's `?cascade=1`; a lot only marked `Complete` by hand is not locked |
| `ProcessingBatch` | wet-mill / processing batch. Consumes **one whole** `HarvestLot`: creating a batch flips the lot to `Complete`, deleting the last batch flips it back to `ReadyForProcessing`. `createdById` |
| `DryingLogEntry` | per-batch drying log row |
| `PhysicalTestResults` | one-to-one physical test on a processing batch |
| `ParchmentLot` | dried parchment output from a `ProcessingBatch` |
| `ParchmentWithdrawal` | withdrawal from a parchment lot (sale / sample / loss). `voidedAt` set = void: its kg are back on the lot and it counts for nothing (`sql/005`) |
| `GreenBeanLot` | hulled green bean output. Can come from a `ParchmentLot` or external import. `parchmentWithdrawalId` = the Hull & Grade that made it (`sql/005`). `qcNotes` = the processor's QC notes (`sql/008`) |
| `GreenBeanWithdrawal` | withdrawal from a green bean lot. `targetRoasterId` = the roaster whose stock got the kg; `voidedAt` set = void, as above (`sql/005`) |

### Ownership chain (used by `requireOwnership`)
```
parchmentLot.processingBatch.createdById
greenBeanLot.createdById
processingBatch.createdById
harvestLot.createdById   (fallback: harvestLot.farm.ownerId)
farm.ownerId
```
A parchment withdrawal inherits ownership from its parchment lot's processing
batch. A green bean withdrawal inherits from its green bean lot.

### Reference data
| Model | Purpose |
|---|---|
| `CropYear` | crop year tag for harvest / processing |
| `ActivityType` | reference list for GAP logs |
| `CoffeeVariety` | reference list for varieties |
| `ProcessType` | reference list for processing methods |

### Roaster
| Model | Purpose |
|---|---|
| `RoasterInventoryItem` | unroasted green inventory, internal or external. Green-bean sale lines that are not Cancelled take their kg straight out of `remainingWeightKg` (guarded SQL in the sale-order routes) |
| `RoastBatch` | individual roast batch tied to inventory. `soldWeightKg` = roasted kg held by sales that are not Cancelled; written only by the sale-order routes through a guarded SQL `UPDATE`, so it never passes `roastedWeightKg`. Left to sell = `roastedWeightKg - soldWeightKg` |

### Sales
| Model | Purpose |
|---|---|
| `Customer` | sale customer (B2B or retail). Shared by every roaster |
| `SaleOrder` | order header, `status: SaleOrderStatus`, owner `createdBy`. `customerName`, `customerPhone`, `customerAddress` are snapshots taken when the sale is recorded or its customer changes, so the receipt never changes afterwards |
| `SaleOrderItem` | order line. `roastBatchId` = the roast it was sold from, or `roasterInventoryId` = the seller's stock row a green-bean line came from, never both (CHECK in `sql/003`). Lines with neither are older green-bean lines, which are read-only; `greenBeanLotId` is copied from the roast or stock row and `lotGrade` is a snapshot of its grade |
| `Invoice` | invoice header, `status: InvoiceStatus` |
| `InvoiceItem` | invoice line items |
| `PricingHistory` | append-only price snapshots |
| `DocumentSequence` | last number handed out per document series (`key` = prefix + year, e.g. `HL-2026`, `ORD-2026`). Written only by `lib/documentSequence` (`sql/009`) |

### Cupping — HANDS-OFF (see `CLAUDE.md`)
`CuppingSession`, `CuppingSample`, `CuppingSessionJudge`, `JudgeScore`,
`CuppingScore`. Do not modify without explicit user request.

## Key enums
`UserRole`, `ProcessingBatchStatus`, `HarvestLotStatus`, `ParchmentLotStatus`,
`ParchmentSourceType`, `GreenBeanSourceType`, `GreenBeanAvailabilityStatus`,
`WithdrawalType`, `ParchmentWithdrawalType`, `CuppingSessionType`,
`CuppingSessionStatus`, `SaleOrderStatus`, `InvoiceStatus`, `CustomerType`,
`WeatherSource`, `RoastLevel`.

## Display IDs
Many models carry a `displayId @unique` like `HL-2026-7`, `PB-2026-12`,
`PCH-2026-3`, `GBL-2026-2`. Take them with `lib/utils.ts → nextDisplayId` /
`nextDisplayIds` inside `withDisplayIdRetry`: the number comes from the
`DocumentSequence` counter (`sql/009`), so it is never handed out twice, not
even after a delete. The `backfill-display-ids` API route exists to populate
legacy rows and takes its numbers from the same counter.
