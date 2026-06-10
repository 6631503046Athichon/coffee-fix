# Components

UI is grouped by role / domain. Cross-domain primitives live in `common/` and
`modals/`. Per-role workspaces live in their own folder.

## Folder index

| Folder | Target role | What's inside |
|---|---|---|
| `auth/` | unauthenticated | `Login`, `ForgotPassword`, `ResetPassword`, `FirstLoginSetup` |
| `common/` | all | shared primitives (see below) |
| `layout/` | all logged-in | `Header`, `Sidebar` |
| `admin/` | Admin | `ActivityTypeManagement`, `ProcessTypeManagement` |
| `farmer/` | Farmer | dashboards, farm CRUD, harvest lots, soil, weather, GAP |
| `processor/` | Processor | `ProcessorWorkbench` + `workbench/` sub-components + `modals/` |
| `roaster/` | Roaster | `RoasterWorkbench`, inventory tables, `RoastLogPanel` |
| `cupper/` | Cupper | HANDS-OFF — see `CLAUDE.md` |
| `competition/` | Competition | `CompetitionDashboard` |
| `modals/` | cross-domain | generic modals listed below |

## `common/`
Primitives reused everywhere:
`Alert`, `Badge`, `Button`, `DatePicker`, `Dropdown`, `FarmMapView`,
`Input`, `Modal`, `PageHeader`, `ProtectedRoute`, `RestoredDataBanner`, `Select`,
`StatCard`, `ToastContainer`. Re-exported via `common/index.ts`.

## `auth/`
`Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `FirstLoginSetup.tsx`.
Wired against `services/auth/authService.ts` and `AuthContext`.

## `layout/`
`Header.tsx`, `Sidebar.tsx`. Role-aware nav.

## `admin/`
- `ActivityTypeManagement.tsx` — CRUD for `ActivityType` reference list
- `ProcessTypeManagement.tsx` — CRUD for `ProcessType` reference list

## `farmer/`
- `FarmerDashboard.tsx` — landing page for Farmer role
- `FarmManagement.tsx` — list / select farms
- `AddFarmPage.tsx` — create a farm
- `HarvestLotsManagement.tsx` — harvest lot list / create
- `HarvestLotDetail.tsx` — single harvest lot view
- `FarmSoilPanel.tsx`, `FarmWeatherPanel.tsx` — embedded panels in farm view
- `FarmerDataHub.tsx` — aggregated farmer data
- `GAPComplianceHelper.tsx` — GAP log helper

## `processor/`
- `ProcessorWorkbench.tsx` — large kanban-style workbench (process + grade)
- `ParchmentTab.tsx` — parchment stock view
- `InvoiceReceipt.tsx` — invoice printout
- `processor/workbench/` — `KanbanCard`, `KanbanColumn`, `Pagination`,
  `DebouncedSearchInput`, `GradeDropdown`, `ProcessTypeDropdown`, `CropYearChips`,
  `ModalPortal`, `scoring.ts`, `constants.ts`
- `processor/modals/` — `CompleteBatchModal`, `HullAndGradeModal`,
  `ParchmentWithdrawModal`, `StartProcessingModal`

## `roaster/`
- `RoasterWorkbench.tsx` — main roaster page
- `InternalLotsTable.tsx`, `ExternalLotsTable.tsx`
- `RoastLogPanel.tsx`

## `cupper/` — HANDS-OFF (see `CLAUDE.md`)
`CuppingHub`, `CuppingSessionDetail`, `CupperScoringSheet`, `CreateCuppingSessionModal`.

## `competition/`
`CompetitionDashboard.tsx`.

## `modals/` — cross-domain (grouped by area)
- `modals/user/` — `CreateUserModal`, `EditUserModal`, `TransferOwnershipModal`
- `modals/customer/` — `CreateCustomerModal`
- `modals/farm/` — `HarvestLotModal`
- `modals/qr/` — `QRCodeModal`

Each subfolder has an `index.ts` barrel.

## Top-level loose pages
- `TraceabilityHub.tsx`, `TraceabilityPage.tsx` — internal traceability views
- `PublicTraceabilityPage.tsx` — public unauthenticated view
- `QualityInsights.tsx` — quality dashboard
- `CustomerManagement.tsx`, `UserManagement.tsx`, `CoffeeVarietiesManager.tsx` —
  admin / sales pages
