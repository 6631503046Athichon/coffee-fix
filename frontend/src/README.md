# Frontend src/ — overview

Vite + React 19 SPA (TypeScript, non-strict).

## Entry
- `index.tsx` — Vite entry, mounts `<App />`
- `App.tsx` — top-level routing (hash-based via `utils/hashRouting.ts`)
- `styles.css` — global Tailwind layer
- `vite-env.d.ts`

## Directory map
| Folder | What lives here |
|---|---|
| `components/` | All UI. Grouped by role / domain. See `components/README.md`. |
| `services/` | Thin fetch clients, one per backend domain. All go through `services/api.ts`. |
| `contexts/` | React context providers — `AuthContext`, `ToastContext`. |
| `hooks/` | Shared hooks — `useDataContext`, `useFormPersist`. |
| `utils/` | Pure utilities — formatters, routing, CSV export, logger. Tests co-located. |
| `types/` | Domain TS types (split from the legacy `types.ts`). |
| `test/` | Vitest setup (`setup.ts`). |

## Single files at this level
- `constants.ts` — shared constants
- `types.ts` — legacy single-file types (gradually being split into `types/`)

## Conventions
- Single quotes, no semicolons.
- TypeScript strict mode is OFF (`tsconfig.json`). Keep types accurate anyway.
- Call backend through `services/<domain>Service.ts`, never `fetch` inline.
- Use `useAuth()` from `contexts/AuthContext` for the current user.
- Use `useToast()` from `contexts/ToastContext` for notifications.
- Hash-based routing — link via `#/path`, NOT real browser routes.
