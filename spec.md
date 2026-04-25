# Coffee Lab Platform — Engineering Spec

เอกสารนี้เป็น **สเปคเทคนิคเชิงลึก** สำหรับประเด็นที่ทะลุผ่านระดับ style guide ทั่วไป ใช้คู่กับ [`CODING_STANDARDS.md`](CODING_STANDARDS.md) ที่ root ของ repo (ซึ่งเป็นเวอร์ชันปรับแก้ของเอกสาร `.docx` เดิมให้ตรงกับโค้ดจริง)

**โครงสร้างโปรเจกต์จริง**: เป็น 2 โปรเจกต์แยก — `backend/` (Next.js 14 App Router + Prisma) และ `frontend/` (Vite + React 19 SPA)

---

## 1. Rate Limiting บน Auth Endpoints

### 1.1 เหตุผล

ก่อนหน้านี้ auth endpoints ไม่มี rate limit ทำให้เสี่ยงต่อ:
- **Credential stuffing / brute-force** บน `/login`, `/reset-password`
- **Email quota abuse** บน `/forgot-password` (ส่ง reset link ไม่จำกัดจำนวน)
- **Token enumeration** บน `/verify-reset-token`

### 1.2 สเปค

ทุก auth endpoint ที่ระบุในตารางด้านล่างต้องผ่าน `rateLimit()` ก่อนลงมือทำงานจริง (อยู่บนสุดของ `try` block)

**โมดูล**: [`backend/src/lib/rateLimit.ts`](backend/src/lib/rateLimit.ts)

**สัญญาของฟังก์ชัน**:

```ts
const limited = await rateLimit(request, RATE_LIMITS.LOGIN)
if (limited) return limited
```

- คืนค่า `NextResponse` (สถานะ 429) ถ้าเกินโควตา — route ต้อง return ออกทันที
- คืนค่า `null` ถ้าผ่าน — ทำงานต่อได้

**HTTP response เมื่อเกินโควตา**:

```
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: <max>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix-seconds>

{ "error": "Too many requests. Please try again later.", "retryAfter": <seconds> }
```

### 1.3 Preset values

| Endpoint | Preset | Window | Max |
|---|---|---|---|
| `POST /api/auth/login` | `LOGIN` | 15 นาที | 5 |
| `POST /api/auth/forgot-password` | `FORGOT_PASSWORD` | 1 ชั่วโมง | 3 |
| `POST /api/auth/register` | `REGISTER` | 1 ชั่วโมง | 10 |
| `POST /api/auth/reset-password` | `RESET_PASSWORD` | 15 นาที | 5 |
| `GET /api/auth/verify-reset-token` | `VERIFY_TOKEN` | 15 นาที | 20 |
| `POST /api/auth/first-login-update` | `FIRST_LOGIN` | 15 นาที | 10 |

ตัวเลขปรับให้ (ก) แน่นพอที่จะหยุด automated attack และ (ข) หลวมพอไม่ล็อกผู้ใช้จริงที่พิมพ์รหัสผ่านผิด 2–3 ครั้ง

### 1.4 Key extraction (ระบุตัวผู้เรียก)

Default: ใช้ client IP จาก header ตามลำดับ
1. `x-forwarded-for` (entry แรก) — reverse proxy เช่น Vercel, Nginx, Railway
2. `x-real-ip` — fallback
3. `'anonymous'` — หากทั้งสอง header ไม่มี

ถ้าต้อง custom key (เช่น rate limit ต่อ user ID แทน IP) ใช้ `keyFn`:

```ts
await rateLimit(request, {
  ...RATE_LIMITS.LOGIN,
  keyFn: (req) => getUserIdFromToken(req) ?? getClientIp(req),
})
```

### 1.5 Storage

ตอนนี้เป็น **in-memory `Map`** — เหมาะกับ single-instance deployment (เช่น Railway, self-hosted)

**หากย้ายไป Vercel / serverless / multi-instance** ต้องสลับ backing store เป็น Redis
แนะนำ [`@upstash/ratelimit`](https://github.com/upstash/ratelimit) — สัญญา `rateLimit()` ออกแบบไว้ให้ swap ง่าย

### 1.6 Test hygiene

`__tests__/setup.ts` เรียก `__resetRateLimitForTests()` ก่อนทุก test case กัน bucket state รั่วข้าม test file

**ห้าม** export หรือใช้ `__resetRateLimitForTests()` จาก production code

---

## 2. Code Formatting (Prettier)

### 2.1 Config

อยู่ที่ root ของ repo: [`.prettierrc`](.prettierrc)

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**หมายเหตุ**: ค่านี้ตรงกับโค้ดที่ commit อยู่ (single quote, ไม่มี semicolon) และทับค่าที่เอกสาร coding standards .docx ระบุเดิม (`semi: true, singleQuote: false`)

### 2.2 Ignore list

[`.prettierignore`](.prettierignore) ครอบคลุม:
- Build output: `dist/`, `.next/`, `build/`, `coverage/`
- Generated: `prisma/migrations/`, `schema.prisma`, `next-env.d.ts`, `*.tsbuildinfo`
- Lockfiles, env files, binary artifacts

### 2.3 การใช้

```bash
# เช็ค format ทั้ง repo
npx prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"

# แก้ format ให้ตรง
npx prettier --write "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"
```

---

## 3. Continuous Integration (GitHub Actions)

### 3.1 Workflow

อยู่ที่ [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — trigger ทุก push ไป `main` และทุก PR ที่ target `main`

### 3.2 Jobs (รันขนานกัน)

| Job | Steps |
|---|---|
| `backend` | `npm ci` → `prisma generate` → `npm run lint` → `npm test` → `npm run build` |
| `frontend` | `npm ci` → `tsc --noEmit` → `vitest run` → `vite build` |
| `format-check` | `prettier --check` ทั้ง repo (ตั้ง `continue-on-error: true` ครั้งแรก) |

### 3.3 CI environment stubs

ที่ backend job ใช้ stub env vars ให้ Prisma/Next สามารถ generate/build ผ่าน (ไม่เชื่อมต่อฐานข้อมูลจริง):

```yaml
env:
  DATABASE_URL: postgresql://ci:ci@localhost:5432/ci?schema=public
  JWT_SECRET: ci-only-secret-with-sufficient-length-and-entropy-abcdef0123456789
  NEXTAUTH_SECRET: ci-nextauth-secret-with-sufficient-length-abcdef0123456789
  NODE_ENV: test
```

**ห้าม** commit production secrets ลงไฟล์ workflow ใช้ GitHub Secrets เสมอเมื่อเชื่อมต่อบริการจริง

### 3.4 Concurrency control

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

ยกเลิก run ก่อนหน้าเมื่อมี push ใหม่บน ref เดียวกัน — ประหยัด CI minutes

---

## 4. Known Issues

สถานะ ณ การอัปเดตล่าสุด:

### 4.1 ✅ TypeScript compile errors (Prisma enum casting) — แก้แล้ว

แก้ 7 route files ให้ validate string ผ่าน `Object.values(Enum).includes(...)` ก่อน cast:

- [`backend/src/app/api/cupping-sessions/route.ts`](backend/src/app/api/cupping-sessions/route.ts) — `CuppingSessionType`, `CuppingSessionStatus`
- [`backend/src/app/api/parchment-lots/route.ts`](backend/src/app/api/parchment-lots/route.ts) — `ParchmentLotStatus`
- [`backend/src/app/api/processing-batches/route.ts`](backend/src/app/api/processing-batches/route.ts) — `ProcessingBatchStatus`
- [`backend/src/app/api/sale-orders/route.ts`](backend/src/app/api/sale-orders/route.ts) — `SaleOrderStatus`
- [`backend/src/app/api/invoices/route.ts`](backend/src/app/api/invoices/route.ts) — `InvoiceStatus`
- [`backend/src/app/api/customers/route.ts`](backend/src/app/api/customers/route.ts) — `CustomerType`

**Pattern ที่ใช้**:

```ts
import { Prisma, CuppingSessionType } from '@prisma/client'

const type = request.nextUrl.searchParams.get('type')
if (type && (Object.values(CuppingSessionType) as string[]).includes(type)) {
  where.type = type as CuppingSessionType
}
```

### 4.2 ✅ Zod v4 `extend()` syntax — แก้แล้ว

[`backend/src/app/api/users/route.ts`](backend/src/app/api/users/route.ts) ใช้ shape spread pattern แทน `.extend()`:

```ts
const createUserWithOptionsSchema = z.object({
  ...createUserSchema.shape,
  autoGenerate: z.boolean().optional().default(true),
})
```

### 4.3 ✅ Zod v4 ZodIssue path type — แก้แล้ว

[`backend/src/lib/validations/middleware.ts`](backend/src/lib/validations/middleware.ts) ใน zod v4 `path` เป็น `PropertyKey[]` (มี `symbol` ได้) ต้องแปลงเป็น string ก่อน:

```ts
details: error.issues.map((e) => ({
  field: e.path.map(String).join('.'),
  message: e.message,
  code: e.code,
}))
```

### 4.4 ✅ credentialGenerator signature — แก้แล้ว

[`backend/src/lib/credentialGenerator.ts`](backend/src/lib/credentialGenerator.ts) เดิมรับ `PrismaClient` แต่ singleton ใน `backend/src/lib/prisma.ts` ใช้ `$extends()` ทำให้ type เป็น `DynamicClientExtensionThis` ไม่ใช่ `PrismaClient` ตรง ๆ

แก้ด้วย structural type ที่ครอบคลุมทั้งสองกรณี:

```ts
type UserLookupDb = {
  user: {
    findMany: (args: {
      where: { username: { startsWith: string } }
      select: { username: true }
      orderBy: { username: 'desc' }
    }) => Promise<Array<{ username: string | null }>>
  }
}
```

### 4.5 ✅ Prisma UpdateInput vs UncheckedUpdateInput — แก้แล้ว

7 route file ใช้ `Prisma.XxxUpdateInput` แต่ assign scalar FK (เช่น `farmId`, `cropYearId`, `ownerId`) ที่อยู่ใน `UncheckedUpdateInput` เท่านั้น Prisma แยก 2 type เพื่อบังคับเลือกระหว่าง nested `connect` กับ scalar FK

**แก้**: เปลี่ยนเป็น `UncheckedUpdateInput` ใน:
- [`backend/src/app/api/farms/[id]/route.ts`](backend/src/app/api/farms/[id]/route.ts)
- [`backend/src/app/api/gap-logs/[id]/route.ts`](backend/src/app/api/gap-logs/[id]/route.ts)
- [`backend/src/app/api/green-bean-lots/[id]/route.ts`](backend/src/app/api/green-bean-lots/[id]/route.ts)
- [`backend/src/app/api/harvest-lots/[id]/route.ts`](backend/src/app/api/harvest-lots/[id]/route.ts)
- [`backend/src/app/api/processing-batches/[id]/route.ts`](backend/src/app/api/processing-batches/[id]/route.ts)
- [`backend/src/app/api/weather-records/[id]/route.ts`](backend/src/app/api/weather-records/[id]/route.ts)

ฝั่ง `farms/[id]` ต้อง compute `caretakerNames` เป็น local array ก่อน แทนการอ่านจาก `updateData.caretakerNames` (ใน `UncheckedUpdateInput` field นี้เป็น union `string[] | FarmUpdatecaretakerNamesInput` ซึ่ง narrow ยากเพราะมี `.length` เฉพาะสาขาเดียว)

### 4.6 ✅ token-extraction test mocks — แก้แล้ว

[`backend/__tests__/token-extraction.test.ts`](backend/__tests__/token-extraction.test.ts) — 2 test ที่ route POST เรียก `prisma.user.findUnique` หลายครั้ง (`requireAuth` lookup + full-row fetch + username/email uniqueness) เดิมใช้ `mockResolvedValueOnce` ทำให้ครั้งที่ 2+ กลับมาเป็น `undefined`

**แก้**: เปลี่ยนเป็น `mockResolvedValue()` (persistent) ทุก call ได้ user เดิม uniqueness check เทียบ `id` กับตัวเองผ่าน safe

### 4.7 ✅ ESLint — แก้แล้ว

- ติดตั้ง `eslint@8.57.0 + eslint-config-next@14` เป็น devDependency
- สร้าง [`backend/.eslintrc.json`](backend/.eslintrc.json) ใช้ `next/core-web-vitals`
- `ignorePatterns` ครอบ `node_modules/`, `.next/`, `coverage/`, `prisma/migrations/`, `scripts/`, `next-env.d.ts`

**ยืนยัน**: `npm run lint` → `✔ No ESLint warnings or errors`

### 4.8 ✅ 7 pre-existing test failures — แก้แล้ว (commit d26eea0)

เดิม 7 test fail มาก่อน fix session แก้ทั้งหมดแล้ว `npx jest` ผ่าน **180/180**

**`__tests__/safe-parsing.test.ts` (3)** — route ใน `green-bean-lots/[id]/withdrawals/route.ts` ตรวจ `!amountKg` ซึ่ง treat `0` เป็น missing field เปลี่ยนเป็น `amountKg === undefined` แล้ว → 0/NaN/Infinity ตก fall-through ไปเข้า `safeParseFloat` branch ที่คืน `"Invalid amount"` ตามที่ test คาด (และ consume findUnique mock ของแต่ละ test แทนที่จะ leak ข้าม)

**`__tests__/plaintext-password-removal.test.ts` (4)** — เพิ่ม `findFirst: jest.fn()` ใน `mockPrismaUser` แก้ test ให้ import `PUT` แทน `PATCH` (route จริง export `PUT` เท่านั้น)

### 4.9 ✅ Nodemailer CVE — แก้แล้ว (commit 867f26f)

อัปเกรด `nodemailer` จาก `^7.0.10` → `^8.0.5` (+ types) เคลียร์ CVE สองตัว:
- SMTP envelope.size injection
- CRLF ใน EHLO/HELO name

Audit `backend/`: production vulnerabilities ลดจาก 6 → 2 (เหลือ `next` ที่ต้องรอ v16 และ `xlsx` ที่ยังไม่มี upstream fix)

ตรวจ `backend/src/lib/email.ts` — ใช้เฉพาะ API surface ที่ปลอดภัย (ไม่แตะ `envelope.size`, ไม่กำหนด EHLO name เอง) major bump ไม่ต้องแก้ call site

### 4.10 ✅ Frontend TypeScript strict mode — แก้แล้ว (commit df9e586)

เพิ่ม `"strict": true` ใน [`frontend/tsconfig.json`](frontend/tsconfig.json) แก้ 30 type error ที่โผล่มา สรุป pattern ที่ใช้ซ้ำ:

- **Gemini API null safety** ([`frontend/src/services/geminiService.ts`](frontend/src/services/geminiService.ts)) — สร้าง helper `getAI()` + `requireText()` กันกรณี `GoogleGenAI` client เป็น `null` (API key หาย) หรือ `response.text` เป็น `undefined` ใช้แทน `ai.models.generateContent` (5 จุด) และ `response.text` (หลายจุด)
- **Real bug** ([`frontend/src/components/admin/ProcessTypeManagement.tsx`](frontend/src/components/admin/ProcessTypeManagement.tsx)) — `processTypeNameExists` เป็น async แต่ handler ไม่ `await` ทำให้ duplicate check ไม่ทำงาน (Promise เป็น truthy เสมอ) เปลี่ยน handler เป็น async + เพิ่ม `await` แล้ว
- **Sort comparator undefined handling** ([`frontend/src/components/farmer/HarvestLotsManagement.tsx`](frontend/src/components/farmer/HarvestLotsManagement.tsx)) — explicit branch เมื่อ value เป็น `undefined` ทั้งสองฝั่ง / ฝั่งเดียว

`npx tsc --noEmit` ฝั่ง frontend ผ่าน 0 errors

### 4.11 ✅ Tailwind migration CDN → local postcss build — แก้แล้ว (commit c304dda)

ย้าย Tailwind จาก `<script src="https://cdn.tailwindcss.com">` ใน [`frontend/index.html`](frontend/index.html) ไปเป็น local postcss build:

- ใหม่: [`frontend/tailwind.config.ts`](frontend/tailwind.config.ts) ครบทั้ง content glob, theme extend (keyframes, animation, colors indigo palette, fontFamily Inter + Noto Sans Thai)
- ใหม่: [`frontend/postcss.config.js`](frontend/postcss.config.js) ใช้ tailwindcss + autoprefixer
- อัปเดต [`frontend/src/styles.css`](frontend/src/styles.css) เพิ่ม `@tailwind base/components/utilities` directive ข้างบน
- ลบ CDN script + inline `window.tailwindConfig` ออกจาก `index.html`

Bundle CSS เพิ่มจาก ~1 kB (nothing — runtime CDN) → 72 kB (purged local build) — trade-off เพื่อ production bundle ไม่พึ่ง CDN

### 4.12 ✅ Frontend vitest coverage — เพิ่มแล้ว (commit afcf486)

เพิ่ม 4 test files ครอบ utility modules (44 new tests):

- [`frontend/src/utils/formatDisplayId.test.ts`](frontend/src/utils/formatDisplayId.test.ts) — 8 tests
- [`frontend/src/utils/formatters.test.ts`](frontend/src/utils/formatters.test.ts) — 16 tests
- [`frontend/src/utils/idGenerator.test.ts`](frontend/src/utils/idGenerator.test.ts) — 8 tests
- [`frontend/src/utils/errorHandler.test.ts`](frontend/src/utils/errorHandler.test.ts) — 12 tests

`npm test -- --run` ผ่าน **77/77** (รวม 33 transformer tests เดิม)

ยังขาด: component-level tests สำหรับ Button, Input, Toast, DatePicker — tracked เป็น follow-up

### 4.13 ✅ ProcessorWorkbench extract ปฐม — แก้แล้ว

[`frontend/src/components/processor/ProcessorWorkbench.tsx`](frontend/src/components/processor/ProcessorWorkbench.tsx) 5,361 → 4,826 บรรทัด โดย lift helpers 535 บรรทัดออกไปที่ [`frontend/src/components/processor/workbench/`](frontend/src/components/processor/workbench) (11 ไฟล์ใหม่ + barrel index):

- `constants.ts` (types + `isRecentItem` + `formatParchmentStatus`)
- `scoring.ts` (`ScoreInput`, `validateScore`, initial scores)
- `ModalPortal.tsx`, `DebouncedSearchInput.tsx`, `ProcessTypeDropdown.tsx`, `GradeDropdown.tsx`, `CropYearChips.tsx`
- `KanbanCard.tsx`, `KanbanColumn.tsx`, `Pagination.tsx`

ไม่มีการเปลี่ยน behaviour — build + tsc + vitest ผ่านหมด รอบสอง (modal handlers, cupping panel, stock panel) tracked เป็น follow-up ใน CODING_STANDARDS.md §7

### 4.9 Error monitoring (Sentry) — ยังไม่ได้ติด

ต้องรอ DSN จากเจ้าของโปรเจกต์ก่อนตั้งค่า

### 4.14 ✅ BOLA mutation/PII routes — แก้แล้ว (commits dab22e9, 68e2aac, 3b22573)

ก่อนหน้านี้หลาย route `[id]` ตรวจแค่ `requireAuth` หรือ `requireRole` แต่ **ไม่ได้ตรวจว่า user เป็นเจ้าของ record จริง** — Processor A เลยแก้ parchment lot ของ Processor B ได้ Roaster A แก้ invoice ของ Roaster B ได้ ฯลฯ

แก้โดยเดิน ownership chain ที่ระบุใน [`CLAUDE.md`](CLAUDE.md) แล้วเรียก `requireOwnership(user, ownerId, ['Admin'])` จาก [`backend/src/lib/middleware.ts`](backend/src/lib/middleware.ts):

| Route | ownership source | allowed bypass |
|---|---|---|
| `parchment-lots/[id]` PATCH/DELETE | `processingBatch.createdById` | `Admin` |
| `parchment-lots/[id]/withdrawals` POST | `processingBatch.createdById` | `Admin`, `Roaster` |
| `processing-batches/[id]` PUT/DELETE | `createdById` | `Admin` |
| `green-bean-lots/[id]` PATCH/PUT/DELETE | `createdById` | `Admin` |
| `gap-logs/[id]` PUT/DELETE | `createdBy` หรือ `farm.ownerId` | `Admin` |
| `soil-analyses/[id]` PUT (DELETE มีอยู่แล้ว) | `createdBy` หรือ `farm.ownerId` | `Admin` |
| `invoices/[id]` PUT | `createdBy` | `Admin` |
| `sale-orders/[id]` PUT | `createdBy` | `Admin` |

**PII / pricing GETs** — ก่อนหน้านี้เปิดให้ทุก role อ่านได้ เปลี่ยนเป็น `requireRole(['Admin', 'Roaster'])`:
- `GET /api/customers/:id` (email/phone/address)
- `GET /api/sale-orders/:id` (pricing + customer)
- `GET /api/invoices/:id` (pricing + customer)

**Parchment withdrawal status bug** — เดิม set `status='Hulled'` เมื่อ depleted เฉพาะ `withdrawalType='HullAndGrade'` ทำให้ Sale/Sample/Export/Other/RoastingStock ทิ้ง lot ค้างใน `AwaitingHulling` ตลอดกาล แก้ให้ทุกประเภทตั้ง Hulled เมื่อ `currentWeightKg <= 0` และเพิ่ม float residue threshold `< 0.01 kg` กัน 1e-15 dust ค้าง

**Cupping carve-out** — `cupping-sessions/[id] PUT` ก็ยังมีช่องโหว่ (ไม่มี role/ownership check) แต่ตาม policy ใน `CLAUDE.md` ห้ามแตะ cupping ถ้าไม่ได้ขอชัดเจน flagged ใน commit `3b22573` เพื่อให้ pass ครั้งหน้าที่เข้า cupping มาแก้รวมกัน

**Test impact** — มี 3 BOLA test ที่ต้องอัปเดต mock ให้รองรับ ownership lookup ใหม่ (green-bean-lots PUT, processing-batches PUT, parchment-lots PATCH) — ใส่ `createdById` หรือ nested `processingBatch.createdById` ใน mock data ตอนนี้ `npx jest` ผ่าน 180/180 ตามเดิม

### 4.15 ✅ Dead code removal — process-and-hull (commit cd612b9)

flow `Record Process & Hull` ถูกแทนที่ด้วย split flow (Record Process → AwaitingHulling parchment → Withdraw via Hull & Grade / Sale / Sample / etc.) ก่อนหน้านี้ แต่ monolithic modal + service + backend route + zod schema ค้างอยู่ ลบทั้ง 4 จุดเพื่อปิด attack surface:

- `frontend/src/components/processor/modals/ProcessAndHullModal.tsx` (1,040 บรรทัด)
- `frontend/src/services/parchmentLotService.ts` — ลบ `processAndHull()` + `ProcessAndHullInput`
- `backend/src/app/api/parchment-lots/process-and-hull/route.ts`
- `backend/src/lib/validations/parchmentLot.ts` — ลบ `processAndHullSchema` + `ProcessAndHullInput`

**UX polish ที่มากับ commit เดียวกัน**:
- `ParchmentWithdrawModal` เลิกส่ง `notes: purpose` ทุก submit (modal ไม่มีช่อง notes — เดิม duplicate `purpose` ลง column `notes` ใน DB ทุก row)
- `ParchmentTab` reset form state ทั้งใน `handleCloseRecordProcess` และ submit success path กันค่าค้างจาก submit ก่อน
- `ParchmentTab` เลิก hardcode `baggingDate = dryingEndDate` (bagging ทำหลัง drying จบ ไม่ใช่วันเดียวกัน) ปล่อยเป็น `null` ให้ processor set ทีหลังผ่าน batch edit flow

---

## 5. Security Checklist

ใช้เป็นรายการตรวจก่อน merge PR ที่แตะ auth / authorization:

- [ ] Endpoint ที่รับ credential หรือส่ง email มี `rateLimit()` ครอบ
- [ ] ใช้ `requireAuth()` + `requireRole()` ไม่ใช่แปลง token เอง
- [ ] **Mutation route `[id]` (PATCH/PUT/DELETE) ตรวจ ownership ผ่าน `requireOwnership(user, ownerId, ['Admin'])`** — ดู ownership chain ใน [`CLAUDE.md`](CLAUDE.md) (`parchmentLot → processingBatch.createdById`, `greenBeanLot.createdById`, `harvestLot.createdById` หรือ `farm.ownerId`)
- [ ] **GET route ที่คืน PII (email/phone/address) หรือ pricing** จำกัด role ที่ต้องใช้จริง ไม่เปิดให้ทุก authenticated user
- [ ] Validate input ด้วย zod schema ก่อนเข้า business logic
- [ ] Password ผ่าน `hashPassword()` เท่านั้น ห้ามเก็บ plaintext
- [ ] Token reset ใช้ `crypto.randomBytes(32)` และมี `expiresAt`
- [ ] Error message ไม่เปิดเผยว่า user มีอยู่จริง (`forgot-password` ต้องคืนข้อความเดียวกันทั้งเคส user เจอและไม่เจอ)
- [ ] Prisma query ใช้ relation filter ไม่ใช่ raw SQL string concatenation
- [ ] Log error ผ่าน `handleApiError()` ไม่ `console.error` ใน production code โดยตรง
- [ ] **ห้ามแก้ไฟล์ใน cupping module** ([§4.14 carve-out](#414--bola-mutationpii-routes--แก้แล้ว-commits-dab22e9-68e2aac-3b22573)) ถ้าไม่ได้ถูกขอชัดเจน — flag เป็น issue ใน commit message แทน

---

## 6. Verification Status

ผลการรันคำสั่ง verify ล่าสุด:

### 6.1 Backend

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npx tsc --noEmit` (production code only) | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings, 0 errors |
| `npx jest` | ✅ 180/180 pass (7 pre-existing failures ปิดใน §4.8) |
| `npm run build` | ✅ Build succeeded (0 errors, 0 warnings) |
| `npm audit --production` | ⚠️ 2 remaining (next v14 ต้อง v16 breaking, xlsx ยังไม่มี upstream fix) |

### 6.2 Frontend

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors (strict mode เปิดแล้ว) |
| `npm test -- --run` | ✅ 77/77 pass (5 test files) |
| `npm run build` | ✅ Build succeeded (CSS 72 kB, JS 1.71 MB gzip 420 kB) |

---

## 7. การอัปเดตเอกสารนี้

- เพิ่มหัวข้อใหม่เมื่อมีสเปคที่ไม่ได้อยู่ในเอกสารหลัก `.docx`
- แก้ค่าสเปคเมื่อโค้ดเปลี่ยน
- อัปเดต "Known Issues" เมื่อพบ bug ใหม่หรือปิดของเก่า

ผู้แก้ไขล่าสุดควรใส่วันที่ใน commit message (Conventional Commits: `docs:`) ไม่จำเป็นต้องเขียนไว้ในไฟล์
