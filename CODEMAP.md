# Coffee Lab Platform — Code Map

Quick navigation to where things live. If you can't find something, search this file first.

## Top-level layout

- `backend/`   — Next.js 14 App Router API + Prisma + PostgreSQL
- `frontend/`  — Vite + React 19 SPA (TypeScript, non-strict)
- `CLAUDE.md`  — working notes & rules (READ FIRST for hands-off zones)
- `CODING_STANDARDS.md` — code style reference (single quotes, no semicolons)
- `coffee-fix-schema.sql` — SQL snapshot of the DB schema
- `DEMO_CREDENTIALS.md` — login credentials for demo accounts
- `spec.md` — product spec

---

## Backend

### API routes — `backend/src/app/api/`

Routes follow Next.js App Router file conventions. Each `route.ts` exports HTTP methods (`GET`, `POST`, `PUT`, `DELETE`). Grouped by domain below.

#### Auth — `auth/`
- `auth/login/route.ts` — POST login (sets JWT cookie)
- `auth/logout/route.ts` — POST logout (clears cookie)
- `auth/me/route.ts` — GET current authenticated user
- `auth/register/route.ts` — POST register new user (admin-gated; see registration-lockdown test)
- `auth/forgot-password/route.ts` — POST request password reset email
- `auth/verify-reset-token/route.ts` — GET validate a reset token
- `auth/reset-password/route.ts` — POST submit new password with token
- `auth/first-login-update/route.ts` — POST force change password/username/email on first login

#### Farm management — `farms/`
- `farms/route.ts` — list & create farms
- `farms/[id]/route.ts` — read / update / delete a farm
- `farms/[id]/collaborators/route.ts` — manage farm collaborators

#### Lots — traceability chain `harvest → parchment → green bean`
- `harvest-lots/route.ts`, `harvest-lots/[id]/route.ts`
- `parchment-lots/route.ts`, `parchment-lots/[id]/route.ts`
- `parchment-lots/[id]/withdrawals/route.ts` — record parchment withdrawals (sale / sample / loss)
- `parchment-lots/import-excel/route.ts` — bulk import from Excel
- `green-bean-lots/route.ts`, `green-bean-lots/[id]/route.ts`
- `green-bean-lots/[id]/withdrawals/route.ts` — track green bean usage
- `green-bean-lots/[id]/qr/route.ts` — QR code asset
- `green-bean-lots/[id]/generate-public-id/route.ts` — mint public traceability ID

#### Processing — `processing-batches/`, `process-types/`
- `processing-batches/route.ts`, `processing-batches/[id]/route.ts`
- `processing-batches/[id]/drying-logs/route.ts` — drying log entries
- `process-types/route.ts`, `process-types/[id]/route.ts` — reference list of process types

#### Roaster — `roast-batches/`, `roaster-inventory/`
- `roast-batches/route.ts`
- `roaster-inventory/route.ts`, `roaster-inventory/[id]/route.ts`

#### Sales — `sale-orders/`, `invoices/`, `customers/`, `pricing-history/`
- `sale-orders/route.ts`, `sale-orders/[id]/route.ts`
- `invoices/route.ts`, `invoices/[id]/route.ts`
- `customers/route.ts`, `customers/[id]/route.ts`
- `pricing-history/route.ts`

#### Farm observations
- `weather/route.ts` — current weather lookup (external API)
- `weather-records/route.ts`, `weather-records/[id]/route.ts`
- `soil-analyses/route.ts`, `soil-analyses/[id]/route.ts`
- `gap-logs/route.ts`, `gap-logs/[id]/route.ts`

#### Reference data
- `activity-types/route.ts`, `activity-types/[id]/route.ts`
- `coffee-varieties/route.ts`, `coffee-varieties/[id]/route.ts`
- `crop-years/route.ts`, `crop-years/[id]/route.ts`

#### Cupping — HANDS-OFF (see CLAUDE.md)
- `cupping-sessions/route.ts`
- `cupping-sessions/[id]/route.ts`
- `cupping-sessions/[id]/judges/route.ts`
- `cupping-sessions/[id]/samples/route.ts`
- `cupping-sessions/[id]/scores/route.ts`

#### Users
- `users/route.ts` — list / create
- `users/[id]/route.ts` — read / update / delete a user
- `users/transfer-ownership/route.ts` — transfer farm/lot ownership before user deletion

#### Public / utility
- `trace/[publicId]/route.ts` — public traceability page data (no auth)
- `health/route.ts` — health check
- `bulk-load/route.ts` — dashboard initial-load aggregator (one round-trip to hydrate the app)
- `data-version/route.ts` — cache-busting version stamp
- `backfill-display-ids/route.ts` — admin migration tool for legacy rows

### Backend middleware — `backend/src/middleware.ts`
Edge middleware (rate-limit / CORS / cookie passthrough). Not to be confused with `lib/middleware.ts` which is request-handler middleware.

### Backend library — `backend/src/lib/`
- `auth.ts` — JWT sign/verify, password hashing, token extraction
- `middleware.ts` — `requireAuth`, `requireRole`, `requireOwnership`, `optionalAuth`, `errorResponse`, auth cache
- `prisma.ts` — Prisma client singleton (re-use across hot-reloads)
- `rateLimit.ts` — in-memory rate limiter
- `email.ts` — nodemailer setup + reset email templates
- `credentialGenerator.ts` — username/password generation for new users
- `documentNumbers.ts` — sale order / invoice numbering
- `utils.ts` — `safeParseFloat`, `safeParseInt`, `parseDateOnly`, `nextDisplayId`, `nextDisplayIds`, `withDisplayIdRetry`
- `validations/` — Zod schemas, one file per domain (`farm.ts`, `harvestLot.ts`, `parchmentLot.ts`, `greenBeanLot.ts`, `processingBatch.ts`, `roasting.ts`, `sales.ts`, `gapLog.ts`, `soilAnalysis.ts`, `weatherRecord.ts`, `cupping.ts`, `user.ts`, `cropYear.ts`, `referenceData.ts`, `middleware.ts`, `common.ts`, `index.ts`)

### Prisma — `backend/prisma/`
- `schema.prisma` — single-source-of-truth data model
- `seed.ts` — seed script (demo data)
- `migrations/` — migration history

Key models: `User`, `Farm`, `FarmCollaborator`, `CropYear`, `HarvestLot`, `ProcessingBatch`, `DryingLogEntry`, `PhysicalTestResults`, `ParchmentLot`, `ParchmentWithdrawal`, `GreenBeanLot`, `GreenBeanWithdrawal`, `RoasterInventoryItem`, `RoastBatch`, `SaleOrder`, `SaleOrderItem`, `Invoice`, `InvoiceItem`, `Customer`, `PricingHistory`, `WeatherRecord`, `SoilAnalysis`, `GAPLogEntry`, `ActivityType`, `CoffeeVariety`, `ProcessType`, `PasswordResetToken`, plus cupping models (HANDS-OFF).

### Backend scripts — `backend/scripts/`
One-off DB maintenance tools: `check-db.ts`, `check-display-ids.js`, `check-relations.js`, `find-duplicates.ts`, `merge-duplicate-inventory.ts`, `populate-display-ids.ts`, `setup.ts`.

### Tests — `backend/__tests__/`
Jest suites:
- `bola-authorization.test.ts` — BOLA / ownership-chain audit
- `farm-validation.test.ts`, `farm-creation-integration.test.ts`, `farm-creation-roles.test.ts`
- `jwt-secret-validation.test.ts`, `token-extraction.test.ts`
- `plaintext-password-removal.test.ts`, `registration-lockdown.test.ts`
- `safe-parsing.test.ts`, `display-id.test.ts`, `parse-date-only.test.ts`
- `url-validation.test.ts`
- `setup.ts` — Jest bootstrap

---

## Frontend

### Entry — `frontend/src/`
- `index.tsx` — Vite entry, mounts React
- `App.tsx` — top-level routing (hash-based via `utils/hashRouting.ts`)
- `constants.ts` — shared constants
- `types.ts` — legacy single-file types (being split into `types/`)
- `types/displayTypes.ts` — domain types for display IDs
- `styles.css` — global Tailwind layer
- `vite-env.d.ts`

### Components — `frontend/src/components/`

Top-level pages (loose files):
- `CoffeeVarietiesManager.tsx`, `CustomerManagement.tsx`, `UserManagement.tsx`
- `PublicTraceabilityPage.tsx`, `TraceabilityHub.tsx`, `TraceabilityPage.tsx`
- `QualityInsights.tsx`

Grouped folders:
- `auth/` — `Login`, `ForgotPassword`, `ResetPassword`, `FirstLoginSetup`
- `common/` — `Button`, `Input`, `Select`, `Modal`, `DatePicker`, `Dropdown`, `Badge`, `Alert`, `StatCard`, `FarmMapView`, `ProtectedRoute`, `ToastContainer`, `PageHeader`, `RestoredDataBanner`
- `layout/` — `Header`, `Sidebar`
- `admin/` — `ActivityTypeManagement`, `ProcessTypeManagement`
- `farmer/` — `FarmerDashboard`, `FarmManagement`, `AddFarmPage`, `HarvestLotsManagement`, `HarvestLotDetail`, `FarmSoilPanel`, `FarmWeatherPanel`, `FarmerDataHub`, `GAPComplianceHelper`
- `processor/` — `ProcessorWorkbench` (large), `ParchmentTab`, `InvoiceReceipt`
  - `processor/workbench/` — sub-components: `KanbanCard`, `KanbanColumn`, `Pagination`, `DebouncedSearchInput`, `GradeDropdown`, `ProcessTypeDropdown`, `CropYearChips`, `ModalPortal`, `scoring.ts`, `constants.ts`
  - `processor/modals/` — `CompleteBatchModal`, `HullAndGradeModal`, `ParchmentWithdrawModal`, `StartProcessingModal`
- `roaster/` — `RoasterWorkbench`, `InternalLotsTable`, `ExternalLotsTable`, `RoastLogPanel`
- `cupper/` — HANDS-OFF (`CuppingHub`, `CuppingSessionDetail`, `CupperScoringSheet`, `CreateCuppingSessionModal`)
- `competition/` — `CompetitionDashboard`
- `modals/` — cross-domain modals grouped by area:
  - `modals/user/` — `CreateUserModal`, `EditUserModal`, `TransferOwnershipModal`
  - `modals/customer/` — `CreateCustomerModal`
  - `modals/farm/` — `HarvestLotModal`
  - `modals/qr/` — `QRCodeModal`
  - each folder has `index.ts` barrel re-export

### Services — `frontend/src/services/`
Services are grouped by domain. Each domain folder has a barrel `index.ts`. `api.ts` is the base fetch client and stays at the services root.

- `api.ts` — base fetch client (cookie auth, error normalization)
- `utils/transformers.ts` (+ test) — payload normalizers
- `auth/` — `authService`, `userService`
- `farm/` — `farmService`, `farmCollaboratorService`, `soilAnalysisService`, `gapLogService`, `weatherService`, `weatherApiService`, `weatherAutoFetchService`
- `lots/` — `harvestLotService`, `parchmentLotService`, `greenBeanLotService`
- `processing/` — `processingBatchService`, `processTypeService`
- `roaster/` — `roasterService`
- `sales/` — `saleOrderService`, `invoiceService`, `customerService`, `pricingHistoryService`
- `reference/` — `activityTypeService`, `coffeeVarietyService`
- `external/` — `geminiService`

### Types — `frontend/src/types.ts` + `frontend/src/types/`
`types.ts` is now a barrel that re-exports all domain type files. New code should add types into the appropriate `src/types/<domain>.ts` file. Existing imports `from '../../types'` keep working.

- `types/user.ts` — `User`, `UserRole`
- `types/farm.ts` — `Farm`, `FarmCollaborator`
- `types/harvest.ts` — `HarvestLot`, summary types
- `types/processing.ts` — `ProcessingBatch`, `DryingLogEntry`, status enum
- `types/parchment.ts` — `ParchmentLot`, withdrawal, physical test
- `types/greenBean.ts` — `GreenBeanLot`, withdrawal, `PricingHistory`
- `types/roaster.ts` — `RoasterInventoryItem`, `RoastBatch`, `RoastLevel`
- `types/sales.ts` — `Customer`, `SaleOrder`, `SaleOrderItem`, `Invoice`
- `types/weather.ts` — `WeatherRecord`
- `types/soil.ts` — `SoilAnalysis`
- `types/gap.ts` — `GAPLogEntry`, `ActivityType`
- `types/reference.ts` — `ProcessType`, `CropYear`
- `types/cupping.ts` — HANDS-OFF (cupping shared types)
- `types/common.ts` — `AppData`, insights, cross-cutting
- `types/displayTypes.ts` — display-ID rendering types

### Contexts — `frontend/src/contexts/`
- `AuthContext.tsx` — current user, login/logout, role helpers
- `ToastContext.tsx` — toast notifications

### Hooks — `frontend/src/hooks/`
- `useDataContext.ts` — global data fetch / cache hook
- `useFormPersist.ts` — persist form draft to localStorage

### Utils — `frontend/src/utils/`
- `connectionManager.ts` — fetch helpers, retry / abort logic
- `errorHandler.ts` (+ test) — error normalization
- `exportCSV.ts` — CSV export
- `formatDisplayId.ts` (+ test), `formatters.ts` (+ test) — display formatting
- `hashRouting.ts`, `routing.ts` — SPA routing
- `idGenerator.ts` (+ test) — client-side ID generation
- `logger.ts` — log wrapper

### Tests — frontend
Vitest. Co-located as `*.test.ts` in `src/utils/` and `src/services/utils/`. Setup in `src/test/setup.ts`.

---

## How to find things — cheat sheet

| I want to… | Look in… |
|---|---|
| Add a new API endpoint | `backend/src/app/api/<domain>/route.ts` |
| Change auth / permissions logic | `backend/src/lib/middleware.ts` |
| Add a Zod validation schema | `backend/src/lib/validations/<domain>.ts` |
| Edit Prisma schema | `backend/prisma/schema.prisma` |
| Add a new modal | `frontend/src/components/modals/` or domain folder |
| Call a backend endpoint from React | `frontend/src/services/<domain>/<X>Service.ts` (or `from '../services/<domain>'` via the barrel) |
| Add a domain-specific type | `frontend/src/types/<domain>.ts` |
| Add a route to the SPA | `frontend/src/App.tsx` |
| Add a domain-specific type | `frontend/src/types/<domain>.ts` (or `types.ts`) |
| Adjust password / JWT | `backend/src/lib/auth.ts` |
| Adjust ownership chain | `backend/src/lib/middleware.ts` + the API route |
| Add a Prisma migration | `cd backend && npx prisma migrate dev --name <slug>` |
| Run BOLA tests | `cd backend && npx jest bola-authorization` |

---

## Hands-off zones (see CLAUDE.md)
- All cupping code:
  - `backend/src/app/api/cupping-sessions/**`
  - `frontend/src/components/cupper/**`
- Cupping Prisma models: `CuppingSession`, `CuppingSample`, `JudgeScore`, `CuppingSessionJudge`, `CuppingScore`
- Even during a security audit or refactor, flag and ask before changing anything in cupping.
