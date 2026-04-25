# Coffee Lab Platform — Engineering Spec

เอกสารนี้เป็น **สเปคเทคนิคเชิงลึก** สำหรับประเด็นที่ทะลุผ่านระดับ style guide ทั่วไป ใช้คู่กับ [`CODING_STANDARDS.md`](CODING_STANDARDS.md) ที่ root ของ repo (ซึ่งเป็นเวอร์ชันปรับแก้ของเอกสาร `.docx` เดิมให้ตรงกับโค้ดจริง) และ [`CLAUDE.md`](CLAUDE.md) สำหรับกฎเฉพาะตอนแก้โค้ด

**โครงสร้างโปรเจกต์จริง**: เป็น 2 โปรเจกต์แยก — `backend/` (Next.js 14 App Router + Prisma + PostgreSQL/Railway) และ `frontend/` (Vite + React 19 SPA)

---

## 1. Rate Limiting

### 1.1 เหตุผล

- **Auth endpoints** ก่อนหน้านี้ไม่มี rate limit เสี่ยงต่อ credential stuffing / brute-force / email-quota abuse / token enumeration
- **Mutation + expensive endpoints** ก็ต้องครอบด้วย เพราะ retry-loop ติดค้างฝั่ง client หรือ scripted abuse จาก authenticated user สามารถถล่ม DB หรือ spam record ได้

### 1.2 สเปคของฟังก์ชัน

ทุก endpoint ที่ต้อง throttle ต้องเรียก `rateLimit()` หลัง `requireAuth()` (เพื่อให้มี `user.id`) แต่ก่อนเริ่มงานจริง

**โมดูล**: [`backend/src/lib/rateLimit.ts`](backend/src/lib/rateLimit.ts)

```ts
const limited = await rateLimit(request, RATE_LIMITS.LOGIN)
if (limited) return limited

// per-user variant — keyed by user.id แทน IP
const limited = await rateLimit(request, {
  ...RATE_LIMITS.WRITE_LOT,
  keyFn: () => `user:${user.id}`,
})
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

| Endpoint | Preset | Window | Max | Key |
|---|---|---|---|---|
| `POST /api/auth/login` | `LOGIN` | 15 นาที | 5 | IP |
| `POST /api/auth/forgot-password` | `FORGOT_PASSWORD` | 1 ชั่วโมง | 3 | IP |
| `POST /api/auth/register` | `REGISTER` | 1 ชั่วโมง | 10 | IP |
| `POST /api/auth/reset-password` | `RESET_PASSWORD` | 15 นาที | 5 | IP |
| `GET /api/auth/verify-reset-token` | `VERIFY_TOKEN` | 15 นาที | 20 | IP |
| `POST /api/auth/first-login-update` | `FIRST_LOGIN` | 15 นาที | 10 | IP |
| `POST /api/harvest-lots` | `WRITE_LOT` | 5 นาที | 60 | user.id |
| `POST /api/parchment-lots` | `WRITE_LOT` | 5 นาที | 60 | user.id |
| `POST /api/green-bean-lots` | `WRITE_LOT` | 5 นาที | 60 | user.id |
| `POST /api/processing-batches` | `WRITE_LOT` | 5 นาที | 60 | user.id |
| `POST /api/parchment-lots/:id/withdrawals` | `WRITE_LOT` | 5 นาที | 60 | user.id |
| `POST /api/green-bean-lots/:id/withdrawals` | `WRITE_LOT` | 5 นาที | 60 | user.id |
| `POST /api/parchment-lots/import-excel` | `EXPENSIVE` | 1 นาที | 10 | user.id |
| `GET /api/bulk-load` | `EXPENSIVE` | 1 นาที | 10 | user.id |

ตัวเลขปรับให้ (ก) แน่นพอที่จะหยุด automated attack / retry-loop และ (ข) หลวมพอไม่ล็อกผู้ใช้จริงที่พิมพ์รหัสผ่านผิด 2–3 ครั้งหรือ processor ที่บันทึกข้อมูลถี่ ๆ

### 1.4 Key extraction

Default: ใช้ client IP จาก header ตามลำดับ
1. `x-forwarded-for` (entry แรก) — reverse proxy เช่น Vercel, Nginx, Railway
2. `x-real-ip` — fallback
3. `'anonymous'` — หากทั้งสอง header ไม่มี

สำหรับ endpoint ที่ผ่าน auth แล้ว ใช้ `keyFn: () => \`user:${user.id}\`` เพื่อหลีกเลี่ยง NAT shared bucket — ผู้ใช้คนเดียวจาก IP ต่างกันยังนับรวม

### 1.5 Storage

ตอนนี้เป็น **in-memory `Map`** — เหมาะกับ single-instance deployment (เช่น Railway, self-hosted)

**หากย้ายไป Vercel / serverless / multi-instance** ต้องสลับ backing store เป็น Redis แนะนำ [`@upstash/ratelimit`](https://github.com/upstash/ratelimit) — สัญญา `rateLimit()` ออกแบบไว้ให้ swap ง่าย

### 1.6 Test hygiene

`__tests__/setup.ts` เรียก `__resetRateLimitForTests()` ก่อนทุก test case กัน bucket state รั่วข้าม test file ทำให้เทสต์ business logic ไม่เจอ 429 false-positive

**ห้าม** export หรือใช้ `__resetRateLimitForTests()` จาก production code

---

## 2. Concurrency & Data Integrity Patterns

โค้ดเส้นทางสร้าง / แก้ไข lot และ batch ต้องผ่านสามแพทเทิร์นนี้เสมอ มิฉะนั้นข้อมูลจะดริฟภายใต้ concurrent load หรือ timezone shift

### 2.1 displayId allocation — `nextDisplayIds` + `withDisplayIdRetry`

**โมดูล**: [`backend/src/lib/utils.ts`](backend/src/lib/utils.ts)

`nextDisplayId` เพียวแค่อ่าน max แล้วบวก 1 — **race-prone** เมื่อสอง request พร้อมกัน + มี loop bug ถ้าเรียกใน `for` (ทุก iteration อ่าน max เดียวกันก่อน insert จะ commit)

**ใช้ทั้ง 2 helper ร่วมกัน**:

```ts
import { nextDisplayId, nextDisplayIds, withDisplayIdRetry } from '@/lib/utils'

// Single create — wrap in withDisplayIdRetry to recover from concurrent P2002:
const lot = await withDisplayIdRetry(async () => {
  const displayId = await nextDisplayId(prisma.harvestLot, 'HL')
  return prisma.harvestLot.create({ data: { displayId, ... } })
})

// Multiple creates in one transaction (e.g. HullAndGrade graded lots) —
// pre-allocate via nextDisplayIds(prefix, count):
await withDisplayIdRetry(async () => {
  const ids = await nextDisplayIds(prisma.greenBeanLot, 'GBL', gradedLots.length)
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < gradedLots.length; i++) {
      await tx.greenBeanLot.create({ data: { displayId: ids[i], ... } })
    }
  })
})
```

`withDisplayIdRetry` รับ Prisma `P2002` ทั้ง `meta.target: 'displayId'` และ `meta.target: ['displayId']` แต่ **ไม่** retry ถ้า unique conflict มาจาก column อื่น (เช่น email)

### 2.2 Atomic weight decrement — `updateMany` + where guard

**ห้ามอ่าน weight นอก transaction แล้วเอามา compute ค่าใหม่** เพราะสอง request พร้อมกันจะคำนวณจากค่าเดิม → ทั้งคู่ update ลงค่าเดียวกัน → double-spending

แพทเทิร์นมาตรฐาน:

```ts
await prisma.$transaction(async (tx) => {
  // Atomic decrement — Postgres locks the row during UPDATE; loser sees count === 0
  const guarded = await tx.parchmentLot.updateMany({
    where: { id, currentWeightKg: { gte: amount } },
    data: { currentWeightKg: { decrement: amount } },
  })
  if (guarded.count === 0) {
    throw new Error('Insufficient weight (concurrent withdrawal contention)')
  }

  // Re-read post-decrement to clamp residue + decide status
  const fresh = await tx.parchmentLot.findUnique({
    where: { id },
    select: { currentWeightKg: true },
  })
  const finalWeight = (fresh?.currentWeightKg ?? 0) < 0.01
    ? 0
    : parseFloat((fresh!.currentWeightKg).toFixed(6))
  await tx.parchmentLot.update({
    where: { id },
    data: { currentWeightKg: finalWeight, ...(finalWeight <= 0 && { status: 'Hulled' }) },
  })
})
```

**ใช้ใน 3 จุด**: parchment-lots withdrawals, green-bean-lots withdrawals, processing-batches POST (decrements harvest lot's `remainingWeightKg`)

**Edge case** — harvest lot ของ legacy import อาจมี `remainingWeightKg = null` ⇒ decrement บน null = null. ก่อนเรียก guarded decrement ต้อง init ก่อน:

```ts
await tx.harvestLot.updateMany({
  where: { id, remainingWeightKg: null },
  data: { remainingWeightKg: harvestLot.weightKg },
})
```

`updateMany` แบบ conditional ทำให้ปลอดภัยถ้า concurrent tx ทำ init ไปแล้ว — count จะเป็น 0 และเราข้ามไป

### 2.3 Date-only timezone safety — `parseDateOnly`

**โมดูล**: [`backend/src/lib/utils.ts`](backend/src/lib/utils.ts)

`new Date('2026-04-25')` parse เป็น **UTC midnight** ในเขตเวลาลบ (UTC-08 LA) จะแสดงเป็น 2026-04-24 16:00 — เลื่อนวันถอยหลัง 1 วัน. Bangkok (+07) ไม่เห็นบั๊กเพราะ midnight UTC = 07:00 ที่ไทย ยังเป็นวันเดิม

```ts
export function parseDateOnly(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const s = typeof value === 'string' ? value : String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00.000Z`)  // anchor at noon UTC
  }
  return new Date(s)  // pass full ISO datetime through
}
```

12:00 UTC ± 11 ชั่วโมง = 01:00 ถึง 23:00 same day — ครอบคลุมทุก timezone ของพื้นที่ปลูกกาแฟจริง (-11 Pago Pago ถึง +11 Norfolk Island)

**ใช้กับทุก date-only field**: `harvestDate`, `dryingStartDate`, `dryingEndDate`, `baggingDate`, `testDate`, `startDate` / `endDate` (crop year) — ปฏิเสธค่าด้วย `Number.isNaN(parsed.getTime())` เมื่อ parse ไม่ออก

---

## 3. Authorization (BOLA / Ownership)

### 3.1 ลำดับชั้น

ทุก mutation route `[id]` (PATCH/PUT/DELETE) ต้องตรวจ ownership หลัง `requireRole()` ก่อนเริ่มอัปเดต — ผู้ใช้คนเดียวกันใน role เดียวกันยังต้องเป็นเจ้าของ record นั้นจริง ๆ

**Helper**: `requireOwnership(user, ownerId, allowedBypassRoles)` ใน [`backend/src/lib/middleware.ts`](backend/src/lib/middleware.ts) — `Admin` (และ super-admin flag) ผ่านได้เสมอ

**Ownership chain**:

```
parchmentLot      → processingBatch.createdById
greenBeanLot      → createdById (ของ lot เอง)
processingBatch   → createdById
harvestLot        → createdById  หรือ farm.ownerId
gap-log entry     → createdBy    หรือ farm.ownerId
soil-analysis     → createdBy    หรือ farm.ownerId
invoice           → createdBy
sale-order        → createdBy
roaster-inventory → roasterId === user.id (inline check)
farm              → ownerId      (inline check)
```

### 3.2 Mutation routes ที่ผ่าน gate ทั้งหมด

| Route | Owner field | Bypass roles |
|---|---|---|
| `parchment-lots/[id]` PATCH/DELETE | `processingBatch.createdById` | `Admin` |
| `parchment-lots/[id]/withdrawals` POST | `processingBatch.createdById` | `Admin`, `Roaster` |
| `processing-batches/[id]` PUT/DELETE | `createdById` | `Admin` |
| `green-bean-lots/[id]` PATCH/PUT/DELETE | `createdById` | `Admin` |
| `gap-logs/[id]` PUT/DELETE | `createdBy` หรือ `farm.ownerId` | `Admin` |
| `soil-analyses/[id]` PUT/DELETE | `createdBy` หรือ `farm.ownerId` | `Admin` |
| `invoices/[id]` PUT | `createdBy` | `Admin` |
| `sale-orders/[id]` PUT | `createdBy` | `Admin` |
| `harvest-lots/[id]` PUT/DELETE | `createdById` หรือ `farm.ownerId` | `Admin` |
| `farms/[id]` PUT/DELETE | `ownerId` (inline) | `Admin` |
| `roaster-inventory/[id]` PUT | `roasterId` (inline) | `Admin` |

### 3.3 GET routes ที่ปิดด้วย `requireRole`

GET ที่คืน PII (email/phone/address) หรือ pricing — เปิดเฉพาะ role ที่ใช้จริง:

- `GET /api/customers/:id` → `Admin`, `Roaster`
- `GET /api/sale-orders/:id` → `Admin`, `Roaster`
- `GET /api/invoices/:id` → `Admin`, `Roaster`

`GET /api/users` มี view สองชั้นในตัว — non-admin ได้แค่ `id, name, roles` (สำหรับ roaster picker etc.) ส่วน admin ได้ทุก field รวม email + lastLogin

### 3.4 Cupping carve-out

ตาม [`CLAUDE.md`](CLAUDE.md) **ห้ามแตะไฟล์ใน cupping module** ถ้าไม่ได้ถูกขอชัดเจน:
- `backend/src/app/api/cupping-sessions/**`
- `frontend/src/components/cupper/**`
- Prisma models: `CuppingSession`, `CuppingSample`, `JudgeScore`, `CuppingSessionJudge`, `CuppingScore`

ผลกระทบ: `cupping-sessions/[id] PUT` ยังเป็น `requireAuth` เปลือก ๆ ไม่มี role/ownership check — flagged ใน commit `3b22573` รอรอบที่จะเข้า cupping มาแก้รวม

---

## 4. Code Formatting (Prettier)

### 4.1 Config

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

### 4.2 Ignore list

[`.prettierignore`](.prettierignore) ครอบคลุม:
- Build output: `dist/`, `.next/`, `build/`, `coverage/`
- Generated: `prisma/migrations/`, `schema.prisma`, `next-env.d.ts`, `*.tsbuildinfo`
- Lockfiles, env files, binary artifacts

### 4.3 การใช้

```bash
# เช็ค format ทั้ง repo
npx prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"

# แก้ format ให้ตรง
npx prettier --write "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"
```

---

## 5. Continuous Integration (GitHub Actions)

### 5.1 Workflow

อยู่ที่ [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — trigger ทุก push ไป `main` และทุก PR ที่ target `main`

### 5.2 Jobs (รันขนานกัน)

| Job | Steps |
|---|---|
| `backend` | `npm ci` → `prisma generate` → `npm run lint` → `npm test` → `npm run build` |
| `frontend` | `npm ci` → `tsc --noEmit` → `vitest run` → `vite build` |
| `format-check` | `prettier --check` ทั้ง repo (ตั้ง `continue-on-error: true` ครั้งแรก) |

### 5.3 CI environment stubs

ที่ backend job ใช้ stub env vars ให้ Prisma/Next สามารถ generate/build ผ่าน (ไม่เชื่อมต่อฐานข้อมูลจริง):

```yaml
env:
  DATABASE_URL: postgresql://ci:ci@localhost:5432/ci?schema=public
  JWT_SECRET: ci-only-secret-with-sufficient-length-and-entropy-abcdef0123456789
  NEXTAUTH_SECRET: ci-nextauth-secret-with-sufficient-length-abcdef0123456789
  NODE_ENV: test
```

**ห้าม** commit production secrets ลงไฟล์ workflow ใช้ GitHub Secrets เสมอเมื่อเชื่อมต่อบริการจริง

### 5.4 Concurrency control

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

ยกเลิก run ก่อนหน้าเมื่อมี push ใหม่บน ref เดียวกัน — ประหยัด CI minutes

---

## 6. Known Issues & Fix Log

สถานะ ณ การอัปเดตล่าสุด — เรียงตามลำดับที่ปิด

### 6.1 ✅ TypeScript compile errors (Prisma enum casting)

แก้ 7 route files ให้ validate string ผ่าน `Object.values(Enum).includes(...)` ก่อน cast:

- [`backend/src/app/api/cupping-sessions/route.ts`](backend/src/app/api/cupping-sessions/route.ts) — `CuppingSessionType`, `CuppingSessionStatus`
- [`backend/src/app/api/parchment-lots/route.ts`](backend/src/app/api/parchment-lots/route.ts) — `ParchmentLotStatus`
- [`backend/src/app/api/processing-batches/route.ts`](backend/src/app/api/processing-batches/route.ts) — `ProcessingBatchStatus`
- [`backend/src/app/api/sale-orders/route.ts`](backend/src/app/api/sale-orders/route.ts) — `SaleOrderStatus`
- [`backend/src/app/api/invoices/route.ts`](backend/src/app/api/invoices/route.ts) — `InvoiceStatus`
- [`backend/src/app/api/customers/route.ts`](backend/src/app/api/customers/route.ts) — `CustomerType`

**Pattern**:

```ts
import { Prisma, CuppingSessionType } from '@prisma/client'

const type = request.nextUrl.searchParams.get('type')
if (type && (Object.values(CuppingSessionType) as string[]).includes(type)) {
  where.type = type as CuppingSessionType
}
```

### 6.2 ✅ Zod v4 `extend()` syntax

[`backend/src/app/api/users/route.ts`](backend/src/app/api/users/route.ts) ใช้ shape spread pattern แทน `.extend()`:

```ts
const createUserWithOptionsSchema = z.object({
  ...createUserSchema.shape,
  autoGenerate: z.boolean().optional().default(true),
})
```

### 6.3 ✅ Zod v4 ZodIssue path type

[`backend/src/lib/validations/middleware.ts`](backend/src/lib/validations/middleware.ts) — ใน zod v4 `path` เป็น `PropertyKey[]` (มี `symbol` ได้) ต้องแปลงเป็น string ก่อน:

```ts
details: error.issues.map((e) => ({
  field: e.path.map(String).join('.'),
  message: e.message,
  code: e.code,
}))
```

### 6.4 ✅ credentialGenerator signature

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

### 6.5 ✅ Prisma UpdateInput vs UncheckedUpdateInput

7 route file ใช้ `Prisma.XxxUpdateInput` แต่ assign scalar FK (เช่น `farmId`, `cropYearId`, `ownerId`) ที่อยู่ใน `UncheckedUpdateInput` เท่านั้น Prisma แยก 2 type เพื่อบังคับเลือกระหว่าง nested `connect` กับ scalar FK

**แก้** เปลี่ยนเป็น `UncheckedUpdateInput` ใน:
- [`backend/src/app/api/farms/[id]/route.ts`](backend/src/app/api/farms/[id]/route.ts)
- [`backend/src/app/api/gap-logs/[id]/route.ts`](backend/src/app/api/gap-logs/[id]/route.ts)
- [`backend/src/app/api/green-bean-lots/[id]/route.ts`](backend/src/app/api/green-bean-lots/[id]/route.ts)
- [`backend/src/app/api/harvest-lots/[id]/route.ts`](backend/src/app/api/harvest-lots/[id]/route.ts)
- [`backend/src/app/api/processing-batches/[id]/route.ts`](backend/src/app/api/processing-batches/[id]/route.ts)
- [`backend/src/app/api/weather-records/[id]/route.ts`](backend/src/app/api/weather-records/[id]/route.ts)

ฝั่ง `farms/[id]` ต้อง compute `caretakerNames` เป็น local array ก่อน แทนการอ่านจาก `updateData.caretakerNames` (ใน `UncheckedUpdateInput` field นี้เป็น union `string[] | FarmUpdatecaretakerNamesInput` ซึ่ง narrow ยากเพราะมี `.length` เฉพาะสาขาเดียว)

### 6.6 ✅ token-extraction test mocks

[`backend/__tests__/token-extraction.test.ts`](backend/__tests__/token-extraction.test.ts) — 2 test ที่ route POST เรียก `prisma.user.findUnique` หลายครั้ง (`requireAuth` lookup + full-row fetch + username/email uniqueness) เดิมใช้ `mockResolvedValueOnce` ทำให้ครั้งที่ 2+ กลับมาเป็น `undefined`

**แก้** เปลี่ยนเป็น `mockResolvedValue()` (persistent) ทุก call ได้ user เดิม uniqueness check เทียบ `id` กับตัวเองผ่าน safe

### 6.7 ✅ ESLint

- ติดตั้ง `eslint@8.57.0 + eslint-config-next@14` เป็น devDependency
- สร้าง [`backend/.eslintrc.json`](backend/.eslintrc.json) ใช้ `next/core-web-vitals`
- `ignorePatterns` ครอบ `node_modules/`, `.next/`, `coverage/`, `prisma/migrations/`, `scripts/`, `next-env.d.ts`

**ยืนยัน**: `npm run lint` → `✔ No ESLint warnings or errors`

### 6.8 ✅ 7 pre-existing test failures (commit d26eea0)

`__tests__/safe-parsing.test.ts` (3 fail) — route ใน `green-bean-lots/[id]/withdrawals/route.ts` ตรวจ `!amountKg` ซึ่ง treat `0` เป็น missing field เปลี่ยนเป็น `amountKg === undefined` แล้ว → 0/NaN/Infinity ตก fall-through ไปเข้า `safeParseFloat` branch ที่คืน `"Invalid amount"` ตามที่ test คาด (และ consume findUnique mock ของแต่ละ test แทนที่จะ leak ข้าม)

`__tests__/plaintext-password-removal.test.ts` (4 fail) — เพิ่ม `findFirst: jest.fn()` ใน `mockPrismaUser` แก้ test ให้ import `PUT` แทน `PATCH` (route จริง export `PUT` เท่านั้น)

### 6.9 ✅ Nodemailer CVE (commit 867f26f)

อัปเกรด `nodemailer` จาก `^7.0.10` → `^8.0.5` (+ types) เคลียร์ CVE สองตัว:
- SMTP `envelope.size` injection
- CRLF ใน EHLO/HELO name

`npm audit --production` ฝั่ง backend: vulnerabilities ลดจาก 6 → 2 (เหลือ `next` ที่ต้องรอ v16 และ `xlsx` ที่ยังไม่มี upstream fix)

ตรวจ `backend/src/lib/email.ts` — ใช้เฉพาะ API surface ที่ปลอดภัย (ไม่แตะ `envelope.size`, ไม่กำหนด EHLO name เอง) major bump ไม่ต้องแก้ call site

### 6.10 ✅ Frontend TypeScript strict mode (commit df9e586)

เพิ่ม `"strict": true` ใน [`frontend/tsconfig.json`](frontend/tsconfig.json) แก้ 30 type error ที่โผล่มา สรุป pattern ที่ใช้ซ้ำ:

- **Gemini API null safety** ([`frontend/src/services/geminiService.ts`](frontend/src/services/geminiService.ts)) — สร้าง helper `getAI()` + `requireText()` กันกรณี `GoogleGenAI` client เป็น `null` (API key หาย) หรือ `response.text` เป็น `undefined` ใช้แทน `ai.models.generateContent` (5 จุด) และ `response.text` (หลายจุด)
- **Real bug** ([`frontend/src/components/admin/ProcessTypeManagement.tsx`](frontend/src/components/admin/ProcessTypeManagement.tsx)) — `processTypeNameExists` เป็น async แต่ handler ไม่ `await` ทำให้ duplicate check ไม่ทำงาน (Promise เป็น truthy เสมอ) เปลี่ยน handler เป็น async + เพิ่ม `await`
- **Sort comparator undefined handling** ([`frontend/src/components/farmer/HarvestLotsManagement.tsx`](frontend/src/components/farmer/HarvestLotsManagement.tsx)) — explicit branch เมื่อ value เป็น `undefined` ทั้งสองฝั่ง / ฝั่งเดียว

`npx tsc --noEmit` ฝั่ง frontend ผ่าน 0 errors

### 6.11 ✅ Tailwind migration CDN → local postcss build (commit c304dda)

ย้าย Tailwind จาก `<script src="https://cdn.tailwindcss.com">` ใน [`frontend/index.html`](frontend/index.html) ไปเป็น local postcss build:

- ใหม่: [`frontend/tailwind.config.ts`](frontend/tailwind.config.ts) ครบทั้ง content glob, theme extend (keyframes, animation, colors indigo palette, fontFamily Inter + Noto Sans Thai)
- ใหม่: [`frontend/postcss.config.js`](frontend/postcss.config.js) ใช้ tailwindcss + autoprefixer
- อัปเดต [`frontend/src/styles.css`](frontend/src/styles.css) เพิ่ม `@tailwind base/components/utilities` directive ข้างบน
- ลบ CDN script + inline `window.tailwindConfig` ออกจาก `index.html`

Bundle CSS เพิ่มจาก ~1 kB (CDN runtime) → 72 kB (purged local build) — trade-off เพื่อ production bundle ไม่พึ่ง CDN

### 6.12 ✅ Frontend vitest coverage (commit afcf486)

เพิ่ม 4 test files ครอบ utility modules (44 new tests):

- [`frontend/src/utils/formatDisplayId.test.ts`](frontend/src/utils/formatDisplayId.test.ts) — 8 tests
- [`frontend/src/utils/formatters.test.ts`](frontend/src/utils/formatters.test.ts) — 16 tests
- [`frontend/src/utils/idGenerator.test.ts`](frontend/src/utils/idGenerator.test.ts) — 8 tests
- [`frontend/src/utils/errorHandler.test.ts`](frontend/src/utils/errorHandler.test.ts) — 12 tests

`npm test -- --run` ผ่าน **77/77** (รวม 33 transformer tests เดิม)

ยังขาด: component-level tests สำหรับ Button, Input, Toast, DatePicker — tracked เป็น follow-up

### 6.13 ✅ ProcessorWorkbench extract ปฐม

[`frontend/src/components/processor/ProcessorWorkbench.tsx`](frontend/src/components/processor/ProcessorWorkbench.tsx) 5,361 → 4,826 บรรทัด โดย lift helpers 535 บรรทัดออกไปที่ [`frontend/src/components/processor/workbench/`](frontend/src/components/processor/workbench) (11 ไฟล์ใหม่ + barrel index):

- `constants.ts` (types + `isRecentItem` + `formatParchmentStatus`)
- `scoring.ts` (`ScoreInput`, `validateScore`, initial scores)
- `ModalPortal.tsx`, `DebouncedSearchInput.tsx`, `ProcessTypeDropdown.tsx`, `GradeDropdown.tsx`, `CropYearChips.tsx`
- `KanbanCard.tsx`, `KanbanColumn.tsx`, `Pagination.tsx`

ไม่มีการเปลี่ยน behaviour — build + tsc + vitest ผ่านหมด รอบสอง (modal handlers, cupping panel, stock panel) tracked เป็น follow-up ใน CODING_STANDARDS.md §7

### 6.14 ✅ BOLA mutation routes — round 1 (commit dab22e9)

เริ่ม pass แรก ปิด BOLA บน lot/batch mutation routes ผ่าน `requireOwnership(user, ownerId, ['Admin'])`:

| Route | Owner field |
|---|---|
| `parchment-lots/[id]` PATCH/DELETE | `processingBatch.createdById` |
| `parchment-lots/[id]/withdrawals` POST | `processingBatch.createdById` |
| `processing-batches/[id]` PUT/DELETE | `createdById` |
| `green-bean-lots/[id]` PATCH/PUT/DELETE | `createdById` |

PII / pricing GETs locked ลง `Admin` + `Roaster`:
- `GET /api/customers/:id`
- `GET /api/sale-orders/:id`

**Parchment withdrawal status bug ติดมาด้วย** — เดิม set `status='Hulled'` เมื่อ depleted เฉพาะ `withdrawalType='HullAndGrade'` ทำให้ Sale/Sample/Export/Other/RoastingStock ทิ้ง lot ค้างใน `AwaitingHulling` ตลอดกาล แก้ให้ทุกประเภทตั้ง Hulled เมื่อ `currentWeightKg <= 0` และเพิ่ม float residue threshold `< 0.01 kg` กัน 1e-15 dust

### 6.15 ✅ Dead code removal — process-and-hull (commit cd612b9)

flow `Record Process & Hull` ถูกแทนที่ด้วย split flow (Record Process → AwaitingHulling parchment → Withdraw via Hull & Grade / Sale / Sample / etc.) ก่อนหน้านี้ แต่ monolithic modal + service + backend route + zod schema ค้างอยู่ ลบทั้ง 4 จุดเพื่อปิด attack surface:

- `frontend/src/components/processor/modals/ProcessAndHullModal.tsx` (1,040 บรรทัด)
- `frontend/src/services/parchmentLotService.ts` — ลบ `processAndHull()` + `ProcessAndHullInput`
- `backend/src/app/api/parchment-lots/process-and-hull/route.ts`
- `backend/src/lib/validations/parchmentLot.ts` — ลบ `processAndHullSchema` + `ProcessAndHullInput`

**UX polish ที่มากับ commit เดียวกัน**:
- `ParchmentWithdrawModal` เลิกส่ง `notes: purpose` ทุก submit (modal ไม่มีช่อง notes — เดิม duplicate `purpose` ลง column `notes` ใน DB ทุก row)
- `ParchmentTab` reset form state ทั้งใน `handleCloseRecordProcess` และ submit success path กันค่าค้างจาก submit ก่อน
- `ParchmentTab` เลิก hardcode `baggingDate = dryingEndDate` (bagging ทำหลัง drying จบ ไม่ใช่วันเดียวกัน) ปล่อยเป็น `null` ให้ processor set ทีหลังผ่าน batch edit flow

### 6.16 ✅ BOLA mutation routes — round 2 + cupping carve-out (commits 68e2aac, 3b22573)

Audit รอบ 2 พบเพิ่มอีก 5 route ที่ตรวจแค่ `requireAuth` หรือ role อย่างเดียว ไม่ตรวจ ownership:

| Route | Owner field | Bypass roles |
|---|---|---|
| `gap-logs/[id]` PUT/DELETE | `createdBy` หรือ `farm.ownerId` | `Admin` |
| `soil-analyses/[id]` PUT (DELETE มีอยู่แล้ว) | `createdBy` หรือ `farm.ownerId` | `Admin` |
| `invoices/[id]` PUT | `createdBy` | `Admin` |
| `sale-orders/[id]` PUT | `createdBy` | `Admin` |
| `invoices/[id]` GET | restrict to `Admin`/`Roaster` (PII) | n/a |

`cupping-sessions/[id] PUT` ตอนแรกถูก lock ด้วย role+ownership เหมือนกัน แต่ revert ตาม CLAUDE.md policy ใน commit `3b22573` — รอ pass ที่เข้า cupping มาแก้รวม

**Test impact** — มี 3 BOLA test ที่ต้องอัปเดต mock ให้รองรับ ownership lookup ใหม่ (green-bean-lots PUT, processing-batches PUT, parchment-lots PATCH) — ใส่ `createdById` หรือ nested `processingBatch.createdById` ใน mock data

### 6.17 ✅ displayId race + multi-grade duplicate-id bug (commit b29feeb)

**สองบั๊กในก้อนเดียวกัน**:

1. **Inter-request race** — `nextDisplayId` อ่าน max แล้วค่อย insert สอง request พร้อมกันคำนวณ `maxNum + 1` เท่ากัน คนแรกผ่าน คนที่สอง P2002 → 500 ใส่หน้าผู้ใช้
2. **In-loop bug ในการสร้าง green-bean lots ตอน HullAndGrade withdrawal** — โค้ดเดิมเรียก `nextDisplayId` ใน `for` loop แต่ยังไม่มีการ commit insert ระหว่าง iteration ทุกครั้งจึงอ่าน max เดียวกัน → ได้ displayId ซ้ำทุกตัว → grade ที่ 2 เป็นต้นไป fail ที่ insert step

**แก้** ([`backend/src/lib/utils.ts`](backend/src/lib/utils.ts)) — ดู §2.1 สำหรับ pattern:

- เพิ่ม `nextDisplayIds(model, prefix, count)` — อ่าน max ครั้งเดียว คืน `[max+1, max+2, ..., max+count]` แก้บั๊กที่ 2
- เพิ่ม `withDisplayIdRetry(attempt, maxRetries=5)` — ลองใหม่เมื่อเจอ Prisma `P2002` บนคอลัมน์ `displayId` (รับทั้ง `meta.target` แบบ string และ string[]) แก้บั๊กที่ 1
- ใช้ `withDisplayIdRetry` ครอบทั้ง `nextDisplayId` + `prisma.create` ใน 6 call sites (harvest-lots, green-bean-lots, parchment-lots POST, processing-batches POST, parchment-lots/[id]/withdrawals POST, parchment-lots/import-excel POST)

**Test coverage** ([`backend/__tests__/display-id.test.ts`](backend/__tests__/display-id.test.ts), 12 tests):

- `nextDisplayId` — empty table, gap-filled max, ignores non-numeric suffix
- `nextDisplayIds` — sequential allocation จาก one read, count <= 0 ไม่ hit DB, empty table เริ่ม 1
- `withDisplayIdRetry` — ผ่านครั้งแรก, retry บน displayId conflict, รับ target ทั้ง string/array, **ไม่** retry ถ้า unique column อื่น, **ไม่** retry บน error อื่น, exhaust retries แล้ว rethrow

### 6.18 ✅ Weight drift TOCTOU on lot mutations (commit 10c7e70)

**สามจุดที่ลอตน้ำหนักดริฟ**ก่อนแก้: `processing-batches POST` (harvest lot remaining), `parchment-lots/[id]/withdrawals POST` (parchment current), `green-bean-lots/[id]/withdrawals POST` (green bean current) — ทุกจุดอ่านน้ำหนักจาก `findUnique` **นอก** transaction แล้วเอามา compute ค่าใหม่ใน transaction. Postgres READ COMMITTED + ไม่มี row lock → สอง request พร้อมกันคำนวณ `currentWeightKg - amount` จากค่าเดิมตัวเดียวกัน → ทั้งคู่ update ลงค่าเดียวกัน → double-spending

**แก้** ทั้ง 3 ไฟล์ด้วย atomic `updateMany` + where guard — ดู §2.2 สำหรับ pattern เต็ม

`updateMany` คอมไพล์เป็น `UPDATE ... SET col = col - X WHERE id = ? AND col >= X` Postgres lock แถวระหว่าง UPDATE คู่แข่งจะเห็น `count === 0` เพราะค่าใหม่ < X แล้ว → throw → transaction rollback ทั้งก้อน

**Process batch** ของ harvest lot มี edge case: `remainingWeightKg` อาจเป็น `null` (เลกาซีเอกเซลอิมพอร์ต) decrement บน null = null ⇒ ทำ initial-fill ก่อน decrement (ดู §2.2)

หลัง decrement re-read fresh value, clamp residue `< 0` (parchment ใช้ `< 0.01` กัน 1e-15 dust), อัปเดต status (`Hulled`/`Withdrawn`/`Complete`)

### 6.19 ✅ Timezone — date-only fields drift across timezones (commit 10c7e70)

**ปัญหา**: `new Date('2026-04-25')` parse เป็น **UTC midnight** ในเขตเวลาลบ (UTC-08 LA) จะแสดงเป็น 2026-04-24 16:00 — เลื่อนวันถอยหลัง 1 วัน (Bangkok +07 ไม่เห็นบั๊กเพราะ midnight UTC = 07:00 ที่ไทย ยังเป็นวันเดิม)

**แก้** เพิ่ม `parseDateOnly` ใน [`backend/src/lib/utils.ts`](backend/src/lib/utils.ts) — ดู §2.3 สำหรับโค้ดเต็ม. ใช้ใน 6 routes:

- `harvest-lots POST/PATCH` — `harvestDate`
- `processing-batches POST/PATCH` — `dryingStartDate`, `dryingEndDate`, `baggingDate`
- `crop-years POST/PATCH` — `startDate`, `endDate`
- `soil-analyses POST/PATCH` — `testDate`

Test ([`backend/__tests__/parse-date-only.test.ts`](backend/__tests__/parse-date-only.test.ts), 5 tests) ตรวจ `toLocaleDateString` ใน 5 timezone (Pago Pago, LA, UTC, Bangkok, Norfolk) ทั้งหมดได้ 2026-04-25 ตามคาด

### 6.20 ✅ Rate limiting expansion (commit 10c7e70)

ก่อนแก้ rate limit ครอบเฉพาะ auth endpoints (login, forgot/reset password ฯลฯ) endpoint อื่นเปิดให้ใครก็ยิงได้กี่ครั้งก็ได้ → เสี่ยงต่อ retry-loop ติดค้าง, scripted abuse, และ DoS ผ่าน expensive query

**Presets ใหม่** ใน [`backend/src/lib/rateLimit.ts`](backend/src/lib/rateLimit.ts) — รายการครบใน §1.3:

- `WRITE_LOT` (5min / 60 / per user.id) → 6 endpoints (lot/batch creates + withdrawals)
- `EXPENSIVE` (1min / 10 / per user.id) → 2 endpoints (Excel import, bulk-load)

Test setup เดิม `__resetRateLimitForTests()` ทำให้ buckets clear ก่อนแต่ละ test → ทุก test ที่ทดสอบ business logic ไม่เจอ 429 false-positive

### 6.21 Error monitoring (Sentry) — ยังไม่ได้ติด

ต้องรอ DSN จากเจ้าของโปรเจกต์ก่อนตั้งค่า

### 6.22 Credentials rotation — ผู้ใช้ต้องทำเอง

หลังแก้บั๊กชุดใหญ่นี้ควร rotate:
- Railway Postgres password
- `JWT_SECRET` env var
- Brevo SMTP credentials

ผ่าน Railway dashboard / Brevo console — ไม่มีอะไรในโค้ดต้องแก้ตาม

---

## 7. Security Checklist

ใช้เป็นรายการตรวจก่อน merge PR ที่แตะ auth / authorization:

- [ ] Endpoint ที่รับ credential หรือส่ง email มี `rateLimit()` ครอบ (preset ใน §1.3)
- [ ] Endpoint ที่เป็น mutation lot/batch หรือ expensive มี per-user `rateLimit()` ครอบ
- [ ] ใช้ `requireAuth()` + `requireRole()` ไม่ใช่แปลง token เอง
- [ ] **Mutation route `[id]` (PATCH/PUT/DELETE) ตรวจ ownership** ผ่าน `requireOwnership(user, ownerId, ['Admin'])` — ดู ownership chain ใน §3.1
- [ ] **GET route ที่คืน PII (email/phone/address) หรือ pricing** จำกัด role ที่ต้องใช้จริง ไม่เปิดให้ทุก authenticated user
- [ ] Mutation ที่หักน้ำหนักต้องใช้ atomic `updateMany` + where guard (§2.2) ไม่ใช่ findUnique-แล้ว-update
- [ ] เส้นทางที่ create row มี displayId ครอบด้วย `withDisplayIdRetry` (§2.1)
- [ ] Date-only field parse ผ่าน `parseDateOnly` (§2.3) ไม่ใช่ `new Date(string)` ตรง ๆ
- [ ] Validate input ด้วย zod schema ก่อนเข้า business logic
- [ ] Password ผ่าน `hashPassword()` เท่านั้น ห้ามเก็บ plaintext
- [ ] Token reset ใช้ `crypto.randomBytes(32)` และมี `expiresAt`
- [ ] Error message ไม่เปิดเผยว่า user มีอยู่จริง (`forgot-password` ต้องคืนข้อความเดียวกันทั้งเคส user เจอและไม่เจอ)
- [ ] Prisma query ใช้ relation filter ไม่ใช่ raw SQL string concatenation
- [ ] Log error ผ่าน `handleApiError()` ไม่ `console.error` ใน production code โดยตรง
- [ ] **ห้ามแก้ไฟล์ใน cupping module** (§3.4) ถ้าไม่ได้ถูกขอชัดเจน — flag เป็น issue ใน commit message แทน

---

## 8. Verification Status

ผลการรันคำสั่ง verify ล่าสุด:

### 8.1 Backend

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npx tsc --noEmit` (production code only) | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings, 0 errors |
| `npx jest` | ✅ **197/197** pass (12 test files) |
| `npm run build` | ✅ Build succeeded (0 errors, 0 warnings) |
| `npm audit --production` | ⚠️ 2 remaining (next v14 ต้อง v16 breaking, xlsx ยังไม่มี upstream fix) |

Test files ฝั่ง backend:
- `bola-authorization.test.ts`, `display-id.test.ts`, `farm-creation-integration.test.ts`, `farm-creation-roles.test.ts`, `farm-validation.test.ts`, `jwt-secret-validation.test.ts`, `parse-date-only.test.ts`, `plaintext-password-removal.test.ts`, `registration-lockdown.test.ts`, `safe-parsing.test.ts`, `token-extraction.test.ts`, `url-validation.test.ts`

### 8.2 Frontend

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors (strict mode เปิดแล้ว) |
| `npm test -- --run` | ✅ **77/77** pass (5 test files) |
| `npm run build` | ✅ Build succeeded (CSS 72 kB, JS 1.71 MB gzip 420 kB) |

Test files ฝั่ง frontend:
- `formatDisplayId.test.ts`, `formatters.test.ts`, `idGenerator.test.ts`, `errorHandler.test.ts`, `transformers.test.ts`

---

## 9. การอัปเดตเอกสารนี้

- เพิ่มหัวข้อใหม่เมื่อมีสเปคที่ไม่ได้อยู่ในเอกสารหลัก `.docx`
- แก้ค่าสเปคเมื่อโค้ดเปลี่ยน
- อัปเดต "Known Issues & Fix Log" (§6) เมื่อพบ bug ใหม่หรือปิดของเก่า — เรียงเลขต่อเนื่อง อย่าใช้เลขซ้ำ
- อัปเดต "Verification Status" (§8) ทุกครั้งที่ test count / build output เปลี่ยน

ผู้แก้ไขล่าสุดควรใส่วันที่ใน commit message (Conventional Commits: `docs:`) ไม่จำเป็นต้องเขียนไว้ในไฟล์
