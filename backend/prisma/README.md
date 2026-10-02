# Prisma — data model index

Single source of truth: `schema.prisma`. Seed in `seed.ts`.

Schema changes ship as hand-written SQL in `prisma/sql/` (`001_…`, `002_…`, `003_…`),
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
| `User` | account, roles (`UserRole[]`), `isSuperAdmin`, must-change-* flags |
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
| `ParchmentWithdrawal` | withdrawal from a parchment lot (sale / sample / loss) |
| `GreenBeanLot` | hulled green bean output. Can come from a `ParchmentLot` or external import |
| `GreenBeanWithdrawal` | withdrawal from a green bean lot |

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
`PL-2026-3`, `GB-2026-2`. Generate them via `lib/utils.ts → withDisplayIdRetry`
to handle the race on concurrent inserts. The `backfill-display-ids` API route
exists to populate legacy rows.
