# Coffee Lab Platform — Coding Standards

เอกสารนี้สะท้อน **โค้ดจริง** ในรีโป ไม่ใช่เวอร์ชันอุดมคติ ถ้าเจอความขัดแย้งระหว่างไฟล์นี้กับโค้ด — **โค้ดคือความจริง** อัปเดตเอกสารก่อน แล้วค่อยเถียงกัน

อ้างอิงเดิม: `Coffee_Lab_Platform_Coding_Standards.docx` (v1.0, 18 พ.ย. 2568) — เอกสาร docx มีข้อที่ไม่ตรงกับโค้ดอยู่หลายจุด ไฟล์นี้ทำหน้าที่เป็นเวอร์ชันที่ **ยึดจริงได้** บนรีโปนี้

---

## 1. โครงสร้างโปรเจกต์

เป็น **2 โปรเจกต์แยก** ไม่ใช่ monorepo Next.js อย่างเดียวตามที่เอกสาร docx เก่ากล่าว

```
coffee-fix/
├─ backend/            Next.js 14 App Router — ให้เฉพาะ /api/*
│  ├─ prisma/
│  ├─ src/app/api/     route handlers (App Router)
│  ├─ src/lib/         prisma client, auth, validation, email, rate limit
│  └─ __tests__/       Jest + supertest + Prisma mock
└─ frontend/           Vite + React 19 SPA
   ├─ src/components/
   │  ├─ common/       Button, Input, Select, DatePicker, Toast
   │  ├─ farmer/       role dashboards + feature pages
   │  ├─ processor/
   │  │  ├─ workbench/ extracted presentational helpers
   │  │  └─ modals/    start/hull/complete modals
   │  ├─ roaster/
   │  ├─ cupper/
   │  └─ admin/
   ├─ src/contexts/
   ├─ src/hooks/
   ├─ src/services/    fetch wrappers (one per domain)
   ├─ src/utils/       formatters, id generators, error handler
   └─ src/types.ts
```

**ไม่ใช้ `features/` folder** จัดกลุ่มตาม **role-based UI** ใน `components/` แทน

---

## 2. Tech stack

| Layer | Tech | ใช้ไฟล์/หลักฐาน |
|---|---|---|
| Backend runtime | Next.js 14 App Router | [`backend/src/app/api/*/route.ts`](backend/src/app/api) |
| ORM | Prisma 5 | [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) |
| Database | PostgreSQL | `DATABASE_URL` in `.env.example` |
| Validation | zod v4 | [`backend/src/lib/validations/`](backend/src/lib/validations) |
| Auth | JWT + bcryptjs + httpOnly cookie | [`backend/src/lib/auth.ts`](backend/src/lib/auth.ts) |
| Email | nodemailer 8.x | [`backend/src/lib/email.ts`](backend/src/lib/email.ts) |
| Frontend runtime | Vite 6 + React 19 | [`frontend/vite.config.ts`](frontend/vite.config.ts) |
| Styling | Tailwind 3 (local postcss build) | [`frontend/tailwind.config.ts`](frontend/tailwind.config.ts), [`frontend/postcss.config.js`](frontend/postcss.config.js) |
| Client state | React Context + local state | [`frontend/src/contexts/`](frontend/src/contexts) |
| Testing (backend) | Jest 30 + ts-jest | [`backend/jest.config.js`](backend/jest.config.js) |
| Testing (frontend) | Vitest 4 + Testing Library | [`frontend/vite.config.ts`](frontend/vite.config.ts) |

---

## 3. Naming

### 3.1 ใช้จริงในรีโป

- **ไฟล์ React component** → `PascalCase.tsx` (`HarvestLotsManagement.tsx`, `ProcessorWorkbench.tsx`)
- **ไฟล์ hook** → `useXxx.ts` (`useDataContext.ts`)
- **ไฟล์ utility** → camelCase `.ts` (`formatDisplayId.ts`, `idGenerator.ts`, `errorHandler.ts`)
- **Prisma model** → PascalCase singular (`User`, `HarvestLot`, `ProcessingBatch`)
- **Prisma field** → camelCase (`cherryWeight`, `harvestDate`, `farmId`)
- **API path** → kebab-case **plural** (`/api/harvest-lots`, `/api/green-bean-lots`, `/api/cupping-sessions`)
- **Interface / type** → PascalCase ธรรมดา **ไม่มี** `I` prefix, **ไม่มี** `_Type` suffix เช่น `ButtonProps`, `AuthenticatedUser`, `UserRole`
- **Boolean variable** → prefix `is/has/can/should` เช่น `isAuthenticated`, `hasChanges`, `canBypassOwnership`
- **Module constants** → UPPER_SNAKE_CASE เช่น `API_BASE_URL`, `SCA_SENSORY_ATTRIBUTES`, `AUTH_CACHE_TTL`
- **HTTP verbs ไม่อยู่ใน URL** → ใช้ `POST /api/harvest-lots` ไม่ใช่ `/api/createHarvestLot`

### 3.2 ไม่ใช้ (ต่างจากเอกสาร docx เก่า)

- ❌ Hungarian prefix — **ไม่ใช้** `f_`, `str_`, `bln_`, `dt_`, `arr_`, `i_` ทั้งใน schema และโค้ด
- ❌ Interface `I` prefix — ใช้ `ButtonProps` ไม่ใช่ `IButtonProps`
- ❌ Type `_Type` suffix — ใช้ `UserRole` ไม่ใช่ `UserRole_Type`
- ❌ Prisma `@@map` / `@map` — ไม่ map table/column เป็น snake_case ใช้ Prisma default (table = plural PascalCase, column = camelCase)

---

## 4. TypeScript

- `"strict": true` **เปิดทั้งสองฝั่ง** — [`backend/tsconfig.json`](backend/tsconfig.json) และ [`frontend/tsconfig.json`](frontend/tsconfig.json)
- `npx tsc --noEmit` ต้องผ่าน 0 errors ก่อน merge
- ใช้ `type` สำหรับ union/utility, `interface` สำหรับ props/contracts ที่อาจ extend ภายหลัง
- หลีกเลี่ยง `any` — ถ้าจำเป็นให้ใส่ comment อธิบาย

---

## 5. Imports และ Exports

- **Default export** ใช้ได้สำหรับ React component หน้าเดียวของไฟล์ (เช่น `ProcessorWorkbench.tsx`)
- **Named export** ใช้สำหรับ utility, hook, type, constant, หรือ component ที่อยู่ในไฟล์รวม
- ใช้ relative path ภายในฝั่งเดียวกัน ไม่ใช้ `@/` alias (ยังไม่ได้ตั้ง path alias)
- Barrel (`index.ts`) ใช้ได้เมื่อ folder มี 3+ related exports (ดู [`frontend/src/components/processor/workbench/index.ts`](frontend/src/components/processor/workbench/index.ts))

---

## 6. React conventions

- ใช้ **function component** เท่านั้น ไม่ใช้ class component
- Hook ต้องขึ้นต้น `use*` (`useDataContext`, `useToast`)
- ประกาศ component ที่ memo ข้างนอก parent ให้ identity stable เช่น `DebouncedSearchInput`, `Pagination`
- `useEffect` cleanup function จำเป็นเมื่อตั้ง timer/subscription/listener
- ใช้ `useCallback`/`useMemo` เฉพาะเมื่อมีหลักฐานว่าต้อง memo (parent re-render บ่อย หรือ passed ลงไปใน memo'd child)

---

## 7. Component size guideline

- เป้าหมาย: **ไฟล์ ≤ 300 บรรทัด** (soft limit)
- ถ้าเกินให้แตกเป็น subcomponent ใน subfolder เช่น `processor/workbench/*.tsx`
- **ไฟล์ที่ยังเกินและต้อง refactor ต่อ** (ตามลำดับความสำคัญ):
  - `components/processor/ProcessorWorkbench.tsx` (4,826 บรรทัด — รอบแรกตัดออกมาแล้ว 535 บรรทัด, รอบสองต้องแตก modal handlers, cupping sheet, stock panel)
  - `components/farmer/AddFarmPage.tsx` (~1,086)
  - `components/farmer/FarmSoilPanel.tsx` (~988)

---

## 8. Styling

- ใช้ **Tailwind utility classes** ผ่าน local postcss build (ไม่ใช้ CDN อีกต่อไป — ดู [`frontend/index.html`](frontend/index.html))
- ไม่ใช้ `@apply` ในไฟล์ `.css` แยก ให้ write utility classes ตรงใน JSX
- ห้ามใช้สี arbitrary (เช่น `bg-[#123456]`) ยกเว้น edge case ที่จำเป็น ให้ extend palette ใน [`frontend/tailwind.config.ts`](frontend/tailwind.config.ts) แทน

---

## 9. Validation & Error handling (Backend)

- ทุก mutation endpoint รับ body **ผ่าน zod schema** ใน [`backend/src/lib/validations/`](backend/src/lib/validations)
- ใช้ `validate()` หรือ `validateQuery()` helper ใน [`backend/src/lib/validations/middleware.ts`](backend/src/lib/validations/middleware.ts)
- Error response ใช้ `handleApiError(error, 'operation name')` ใน [`backend/src/lib/errorHandler.ts`](backend/src/lib/errorHandler.ts) — normalize Prisma/zod errors เป็น JSON
- Auth endpoint ทุกตัวผ่าน `rateLimit()` (ดู `spec.md` §1)

---

## 10. Validation & Error handling (Frontend)

- Service function (`frontend/src/services/*`) ทำหน้าที่ parse + normalize response ก่อนส่งต่อให้ UI
- ทุก async boundary ใช้ `withErrorHandling(fn, { operation, fallbackValue })` จาก [`frontend/src/utils/errorHandler.ts`](frontend/src/utils/errorHandler.ts) เมื่อมี fallback ที่ยอมรับได้
- UI แสดง error ผ่าน `useToast().addToast({ type: 'error', message })` ไม่ `alert()`
- Map HTTP status → user-facing message ใน `handleApiError` (401 → "Authentication required", 403 → "don't have permission", 404 → "Resource not found")

---

## 11. Authentication & Authorization

- **Hashing**: bcryptjs, cost = 10
- **Session**: JWT ใน httpOnly+Secure+SameSite=Lax cookie ชื่อ `auth-token` (ไม่เก็บใน localStorage)
- **Middleware**: `requireAuth()` ใน [`backend/src/lib/auth.ts`](backend/src/lib/auth.ts) คืน `AuthenticatedUser | NextResponse` ถ้าไม่ผ่าน return response ออกทันที
- **RBAC**: `requireRole([UserRole.Admin, UserRole.Processor])` — role enum อยู่ใน [`backend/src/types.ts`](backend/src/types.ts)
- **Ownership**: ใช้ helper ใน [`backend/src/lib/authorization.ts`](backend/src/lib/authorization.ts) check ว่า resource เป็นของ user คนปัจจุบัน (ยกเว้น admin)
- **Rate limit**: ดู `spec.md` §1 และ [`backend/src/lib/rateLimit.ts`](backend/src/lib/rateLimit.ts)

---

## 12. Database conventions (Prisma)

- ทุก model มี `id String @id @default(cuid())` เป็น primary key (ไม่ใช่ `<model>Id`)
- FK field ตั้งชื่อ `<referenced>Id` เช่น `farmId`, `userId`, `cropYearId`
- Timestamp: `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`
- Soft delete: ใช้ boolean flag เช่น `isActive` เมื่อจำเป็น ไม่สร้าง `deletedAt` ทั่วไป
- ไม่ใช้ `@@map` / `@map` — ปล่อย table/column เป็น default (plural PascalCase / camelCase)
- แก้ schema → `npx prisma generate` → `npx prisma migrate dev --name <desc>`
- **Prisma client** เป็น singleton ใน [`backend/src/lib/prisma.ts`](backend/src/lib/prisma.ts) ใช้ `$extends()` สำหรับ soft-delete hook (หมายเหตุ: type เป็น `DynamicClientExtensionThis` ไม่ใช่ `PrismaClient` ตรง ๆ — ดู spec.md §4.4)

---

## 13. Testing

### 13.1 Backend

- Framework: Jest 30 + ts-jest + supertest
- ทุก API route + auth helper + validation middleware ต้องมี test
- Mock Prisma ด้วย `jest-mock-extended` หรือ manual mock (ดู [`backend/__tests__/`](backend/__tests__))
- ปัจจุบัน **180/180 pass** (หลังแก้ 7 pre-existing failures ใน commit d26eea0)

### 13.2 Frontend

- Framework: Vitest 4 + @testing-library/react + jsdom
- ทุก utility ใน `src/utils/*` ต้องมี `.test.ts` คู่กัน
- Component test เน้น behaviour ไม่ใช่ markup — ใช้ `screen.getByRole`, `userEvent` จาก `@testing-library/user-event`
- ปัจจุบัน **77/77 pass** (5 test files)
- **ยังขาด**: component-level tests (Button, Input, Toast, DatePicker) — tracked เป็น follow-up

### 13.3 เรียก test

```bash
# Backend
cd backend && npx jest

# Frontend
cd frontend && npm test -- --run
```

---

## 14. Git conventions

- **Branch**: ใช้ `main` เป็น integration branch ไม่มี `dev` branch
- **Feature branch**: `feature/<slug>`, `fix/<slug>`, `chore/<slug>`, `refactor/<slug>`
- **PR**: target `main`, squash merge
- **Commit message**: Conventional Commits — `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `style:`, `perf:`
  - Scope เลือกได้: `feat(backend):`, `fix(frontend):`, `test(frontend):`
  - Subject ≤ 72 chars imperative present-tense ("add rate limit" ไม่ใช่ "added rate limit")
  - Body อธิบาย **why** เป็นหลัก
- **ห้าม** skip hook (`--no-verify`) เว้นแต่เจ้าของโปรเจกต์อนุมัติ
- **Co-author trailer**: ไม่ต้องใส่ (repo นี้ไม่ได้ใช้)

---

## 15. Prettier / ESLint

- **Prettier** ยังไม่มี config commit ลง repo — รูปแบบจริงที่ใช้:
  - `singleQuote: true`
  - `semi: false`
  - `printWidth: 100`
  - `trailingComma: 'all'`
  - `arrowParens: 'always'`
- **ESLint** backend ใช้ `next/core-web-vitals` ผ่าน `next lint` — [`backend/.eslintrc.json`](backend/.eslintrc.json)
- **ESLint** frontend ยังไม่มี config — ใช้ `tsc --noEmit` เป็น gate หลัก
- **Tab width**: 2 spaces ทุกภาษา

---

## 16. Environment & Secrets

- `.env` อยู่ใน `.gitignore` — ไม่ commit
- มี `.env.example` ใน [`backend/.env.example`](backend/.env.example) ระบุ key ที่จำเป็น
- Frontend ใช้ `import.meta.env.VITE_*` เท่านั้น (Vite expose เฉพาะ prefix `VITE_`)
- JWT secret ≥ 32 chars, bcrypt cost = 10

---

## 17. สิ่งที่ **ยังไม่ได้ทำ** และ tracked เป็น follow-up

1. แตก `ProcessorWorkbench.tsx` รอบสอง (modal handlers, cupping panel, stock panel)
2. React Testing Library tests สำหรับ common components (Button, Input, Toast)
3. API handler tests เพิ่มสำหรับ route ที่ยังไม่ครอบ
4. Prettier config commit ลง repo เพื่อให้ auto-format ตรงกันทุกเครื่อง
5. ESLint config สำหรับฝั่ง frontend
6. Error monitoring (Sentry) — รอ DSN จากเจ้าของโปรเจกต์

---

## 18. การอัปเดตเอกสารนี้

- เจอ convention ที่ใช้จริงแล้วไม่ตรงกับไฟล์นี้ → **แก้ไฟล์นี้ก่อน** แล้วค่อยเถียงกันว่าจะปรับโค้ดไหม
- commit ที่แก้เอกสาร: `docs(standards): <ประเด็นที่แก้>`
- ถ้าเพิ่มข้อใหม่ ใส่ที่ท้ายหัวข้อที่เกี่ยวข้อง หรือสร้างหัวข้อใหม่
