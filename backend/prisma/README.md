# Prisma — data model index

Single source of truth: `schema.prisma`. Seed in `seed.ts`. Migrations in
`migrations/`.

Run `npx prisma migrate dev --name <slug>` for new migrations, `npx prisma
studio` to inspect data.

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
| `HarvestLot` | raw cherry harvested from a farm. `createdById`, `farmId` |
| `ProcessingBatch` | wet-mill / processing batch consuming harvest lots. `createdById` |
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
| `RoasterInventoryItem` | unroasted green inventory, internal or external |
| `RoastBatch` | individual roast batch tied to inventory |

### Sales
| Model | Purpose |
|---|---|
| `Customer` | sale customer (B2B or retail) |
| `SaleOrder` | order header, `status: SaleOrderStatus` |
| `SaleOrderItem` | order line items |
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
