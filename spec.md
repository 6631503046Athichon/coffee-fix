# Coffee Lab Platform — Engineering Spec

เอกสารนี้เป็นสเปคเสริมของ **Coffee Lab Platform Coding Standards** (ไฟล์ `.docx` เวอร์ชัน 1.0, 18 พ.ย. 2568) ครอบคลุมเฉพาะประเด็นที่ไม่ได้ระบุในเอกสารหลัก หรือที่ต้องอัปเดตให้ตรงกับโค้ดจริง

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

### 4.8 Test failures ที่ยังเหลือ (pre-existing, ไม่ใช่ regression จากงานนี้)

ตอนนี้ `npx jest` ผ่าน 173/180 — มี 7 test ที่ fail มาก่อนแล้ว:

**`__tests__/safe-parsing.test.ts` (3)** — test คาด error message `"Invalid amount"` แต่ route คืน `"Amount, withdrawal type, and purpose are required"` เป็นเรื่อง route validation order กับ test expectations ไม่ตรงกัน ไม่ได้ตัดถนน test จึง reach ไม่ถึง amount parsing

**`__tests__/plaintext-password-removal.test.ts` (4)** — test mocks ไม่ครบ: `mockPrismaUser` มีเฉพาะ `findMany, findUnique, create, update` แต่ route เรียก `prisma.user.findFirst` ด้วย (check email ซ้ำ) ทำให้ route โยน error (500) ก่อนถึง `create`

นอกจากนี้ test `should not store temporaryPassword field during user update` ต้องการ export `PATCH` จาก `/api/users/[id]/route.ts` แต่ไฟล์จริงไม่มี export นี้

**แก้ในอนาคต**: เพิ่ม `findFirst: jest.fn()` ใน mockPrismaUser, ทบทวนว่า route คืน error message ตามลำดับที่ test คาดหรือไม่, ย้าย PATCH logic มาอยู่ที่ `users/[id]/route.ts` ถ้าจำเป็น

### 4.9 Error monitoring (Sentry) — ยังไม่ได้ติด

ต้องรอ DSN จากเจ้าของโปรเจกต์ก่อนตั้งค่า

---

## 5. Security Checklist

ใช้เป็นรายการตรวจก่อน merge PR ที่แตะ auth / authorization:

- [ ] Endpoint ที่รับ credential หรือส่ง email มี `rateLimit()` ครอบ
- [ ] ใช้ `requireAuth()` + `requireRole()` ไม่ใช่แปลง token เอง
- [ ] Validate input ด้วย zod schema ก่อนเข้า business logic
- [ ] Password ผ่าน `hashPassword()` เท่านั้น ห้ามเก็บ plaintext
- [ ] Token reset ใช้ `crypto.randomBytes(32)` และมี `expiresAt`
- [ ] Error message ไม่เปิดเผยว่า user มีอยู่จริง (`forgot-password` ต้องคืนข้อความเดียวกันทั้งเคส user เจอและไม่เจอ)
- [ ] Prisma query ใช้ relation filter ไม่ใช่ raw SQL string concatenation
- [ ] Log error ผ่าน `handleApiError()` ไม่ `console.error` ใน production code โดยตรง

---

## 6. Verification Status (Backend)

ผลการรันคำสั่ง verify ล่าสุด:

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npx tsc --noEmit` (production code only) | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings, 0 errors |
| `npx jest` | ⚠️ 173/180 pass (7 pre-existing failures — ดู §4.8) |
| `npm run build` | ✅ Build succeeded (0 errors, 0 warnings) |

**หมายเหตุ**: test errors 7 ตัวไม่ใช่ regression ของงานนี้ — อยู่ในสอง test file ที่ mock ไม่ครบก่อนหน้านี้ (ดู §4.8) ส่วน 173 test ที่เหลือเขียวทั้งหมด รวมถึง 16 token-extraction tests ที่ผมแก้ mock ให้

---

## 7. การอัปเดตเอกสารนี้

- เพิ่มหัวข้อใหม่เมื่อมีสเปคที่ไม่ได้อยู่ในเอกสารหลัก `.docx`
- แก้ค่าสเปคเมื่อโค้ดเปลี่ยน
- อัปเดต "Known Issues" เมื่อพบ bug ใหม่หรือปิดของเก่า

ผู้แก้ไขล่าสุดควรใส่วันที่ใน commit message (Conventional Commits: `docs:`) ไม่จำเป็นต้องเขียนไว้ในไฟล์
