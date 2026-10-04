# Coffee Lab Backend

Backend API server for Coffee Lab Platform built with Next.js 14, Prisma ORM, and PostgreSQL.

## Tech Stack

- **Framework:** Next.js 14.2 (App Router)
- **API Routes:** Next.js API Routes (`/app/api/*/route.ts`)
- **Database ORM:** Prisma 5.22
- **Database:** PostgreSQL (Railway)
- **Authentication:** JWT + bcrypt
- **Language:** TypeScript (strict mode)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/coffee_lab?schema=public"

# JWT Secret (generate a random string for production)
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Seed account password, required by npm run db:seed (or set every SEED_<ROLE>_PASSWORD; see prisma/seed.ts)
SEED_DEFAULT_PASSWORD="choose-a-strong-seed-password"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:5173"

# Node Environment
NODE_ENV="development"

# Email Configuration (Optional - for password reset emails)
EMAIL_ENABLED="false"
RESEND_API_KEY="re_your_resend_api_key"
RESEND_FROM="onboarding@resend.dev"
EMAIL_FROM="Coffee Lab <onboarding@resend.dev>"

# Google Gemini key for the AI buttons (Optional - see "AI features" below).
# Backend only: never put it in the frontend env, where any value is public.
GEMINI_API_KEY="your-gemini-api-key"
```

`GEMINI_API_KEY` is read only by `POST /api/ai/:feature`. Left unset, that route
answers 501 "AI features are not set up on this server yet" and nothing else
changes. On Vercel, set it in the **backend** project's environment variables
and redeploy. Do not set `VITE_GEMINI_API_KEY` (or any Gemini key) in the
frontend project: Vite pastes `VITE_*` values into the public bundle.

### 3. Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database (recommended for first setup)
npx prisma db push

# Or run migrations
npm run db:migrate

# Seed database with initial data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/first-login-update` - Update password/username on first login
- `POST /api/auth/forgot-password` - Request password reset email
- `POST /api/auth/verify-reset-token` - Verify reset token
- `POST /api/auth/reset-password` - Reset password with token

### Users

- `GET /api/users` - List all users (Admin only)
- `POST /api/users` - Create user (Admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Admin only)
- `POST /api/users/transfer-ownership` - Transfer farm ownership (Admin only)

### Farms

- `GET /api/farms` - List farms (own + collaborating, Admin sees all)
- `POST /api/farms` - Create farm
- `GET /api/farms/:id` - Get farm by ID
- `PUT /api/farms/:id` - Update farm
- `DELETE /api/farms/:id` - Delete farm (Admin only)

### Farm Collaborators

- `GET /api/farms/:id/collaborators` - List farm caretakers
- `POST /api/farms/:id/collaborators` - Add caretaker `{ userId }`
- `DELETE /api/farms/:id/collaborators?userId=` - Remove caretaker

### Harvest Lots

- `GET /api/harvest-lots` - List all harvest lots
- `POST /api/harvest-lots` - Create harvest lot
- `GET /api/harvest-lots/:id` - Get harvest lot by ID
- `PUT /api/harvest-lots/:id` - Update harvest lot

### Processing Batches

- `GET /api/processing-batches` - List all processing batches
- `POST /api/processing-batches` - Create processing batch
- `GET /api/processing-batches/:id` - Get processing batch by ID
- `PUT /api/processing-batches/:id` - Update processing batch
- `POST /api/processing-batches/:id/drying-logs` - Add drying log entry

### Parchment Lots

- `GET /api/parchment-lots` - List all parchment lots
- `POST /api/parchment-lots` - Create parchment lot
- `GET /api/parchment-lots/:id` - Get parchment lot by ID
- `PUT /api/parchment-lots/:id` - Update parchment lot (includes physical test results)

### Green Bean Lots

- `GET /api/green-bean-lots` - List all green bean lots
- `POST /api/green-bean-lots` - Create green bean lot
- `GET /api/green-bean-lots/:id` - Get green bean lot by ID
- `PUT /api/green-bean-lots/:id` - Update green bean lot
- `POST /api/green-bean-lots/:id/withdrawals` - Create withdrawal
- `POST /api/green-bean-lots/:id/generate-public-id` - Get or create the public trace ID (an existing one is kept unless the body is `{ "regenerate": true }`)
- `GET /api/green-bean-lots/:id/qr` - Get QR code for traceability

### Public Traceability

- `GET /api/trace/:publicId` - Public traceability lookup (no auth required)

### AI features

The browser never holds a Gemini key. Each feature takes structured input,
builds its prompt on the server (`src/lib/aiFeatures.ts`) and calls Gemini
(`gemini-2.5-flash`, `src/lib/gemini.ts`) with `GEMINI_API_KEY`, sent in the
`x-goog-api-key` header. Responses are `{ result }`; the key and Gemini's own
error text never appear in a response or the server log. Each feature caps
the length of Gemini's answer (`AI_MAX_OUTPUT_TOKENS`), so the free text a
caller sends cannot steer it into a long, billed one.

- `POST /api/ai/soil-recommendations` - Advice text (Thai) for a soil analysis `{ pH, phosphorus, potassium, nitrogen, calcium, magnesium, organicMatter?, sulfur?, zinc?, iron?, manganese?, copper?, boron?, location?, variety? }` → `{ result: string }` (Farmer, Processor, Admin)
- `POST /api/ai/soil-image` - Read a lab report photo `{ imageBase64, mimeType }` (jpeg, png, webp, heic, heif; at most 4,000,000 base64 characters) → `{ result: { pH?, phosphorus?, …, labName?, certificateNumber? } }`, every value a string (Farmer, Processor, Admin)
- `POST /api/ai/quality-insights` - One attribute across a cupping session `{ attribute, samples: [{ blindCode, averageScore, notes }] }` (1-60 samples, notes up to 2,000 characters) → `{ result: { keyDescriptors, performanceSummary, roasterRecommendations } }` (Processor, Roaster, Admin)
- `POST /api/ai/quality-report` - Annual report over the top lots `{ lots: [{ lotId, score, variety, process, notes }] }` (1-10 lots) → `{ result: ComprehensiveQualityReport }` (Processor, Roaster, Admin)

Every feature needs a signed-in user with one of its roles (super admins
always pass) and a JSON body within the feature's size limit. All features
share one per-user limit of 5 calls a minute. Each server instance counts
requests in memory, and every call that reaches Gemini is also counted on the
user's row (`User.aiWindowStartedAt` / `aiWindowCalls`, `src/lib/aiRateLimit.ts`),
which all instances share: apply `prisma/sql/006_ai_rate_limit.sql` before
deploying (see `prisma/README.md`). As a backstop for the bill, also set a
requests-per-minute quota on the key in Google Cloud.

Errors: 401 signed out, 403 wrong role, 404 unknown feature, 413 body too
large, 415 not JSON, 400 invalid input, 429 rate limited, 501 key not set,
502 Gemini failed or gave an unreadable answer, 504 Gemini took over 25 s.

### Roaster Inventory

- `GET /api/roaster-inventory` - List roaster inventory items
- `POST /api/roaster-inventory` - Claim green bean lot for roasting
- `GET /api/roaster-inventory/:id` - Get inventory item by ID
- `PUT /api/roaster-inventory/:id` - Update inventory item

### Roast Batches

- `GET /api/roast-batches` - List roast batches (a Roaster only gets their own)
- `POST /api/roast-batches` - Create roast batch
- `PUT /api/roast-batches/:id` - Correct a roast (roasted kg can't drop below the kg sold)
- `DELETE /api/roast-batches/:id` - Delete a roast (409 while it is on a sale)
- `GET /api/roast-batches/sellable` - Roasts with roasted kg left to sell

### Cupping Sessions

- `GET /api/cupping-sessions` - List all cupping sessions
- `POST /api/cupping-sessions` - Create cupping session
- `GET /api/cupping-sessions/:id` - Get cupping session by ID
- `PUT /api/cupping-sessions/:id` - Update cupping session
- `POST /api/cupping-sessions/:id/samples` - Add sample to session
- `POST /api/cupping-sessions/:id/judges` - Add judge to session
- `POST /api/cupping-sessions/:id/scores` - Submit score for a sample

### GAP Logs

- `GET /api/gap-logs` - List all GAP logs
- `POST /api/gap-logs` - Create GAP log
- `GET /api/gap-logs/:id` - Get GAP log by ID
- `PUT /api/gap-logs/:id` - Update GAP log
- `DELETE /api/gap-logs/:id` - Delete GAP log

### Soil Analyses

- `GET /api/soil-analyses` - List all soil analyses
- `POST /api/soil-analyses` - Create soil analysis
- `GET /api/soil-analyses/:id` - Get soil analysis by ID
- `PUT /api/soil-analyses/:id` - Update soil analysis

### Weather Records

- `GET /api/weather-records` - List weather records
- `POST /api/weather-records` - Create weather record
- `GET /api/weather-records/:id` - Get weather record by ID
- `PUT /api/weather-records/:id` - Update weather record
- `GET /api/weather` - Fetch weather data from external API

### Activity Types

- `GET /api/activity-types` - List all activity types
- `POST /api/activity-types` - Create activity type (Admin only)
- `GET /api/activity-types/:id` - Get activity type by ID
- `PUT /api/activity-types/:id` - Update activity type (Admin only)
- `DELETE /api/activity-types/:id` - Delete activity type (Admin only)

### Process Types

- `GET /api/process-types` - List all process types
- `POST /api/process-types` - Create process type (Admin only)
- `GET /api/process-types/:id` - Get process type by ID
- `PUT /api/process-types/:id` - Update process type (Admin only)
- `DELETE /api/process-types/:id` - Delete process type (Admin only)

### Coffee Varieties

- `GET /api/coffee-varieties` - List all coffee varieties
- `POST /api/coffee-varieties` - Create coffee variety (Admin only)
- `GET /api/coffee-varieties/:id` - Get coffee variety by ID
- `PUT /api/coffee-varieties/:id` - Update coffee variety (Admin only)
- `DELETE /api/coffee-varieties/:id` - Delete coffee variety (Admin only)

### Crop Years

- `GET /api/crop-years` - List all crop years
- `POST /api/crop-years` - Create crop year (Admin only)
- `GET /api/crop-years/:id` - Get crop year by ID
- `PUT /api/crop-years/:id` - Update crop year (Admin only)

### Customers

- `GET /api/customers` - List all customers
- `POST /api/customers` - Create customer
- `GET /api/customers/:id` - Get customer by ID
- `PUT /api/customers/:id` - Update customer (Admin, Roaster, Processor)
- `DELETE /api/customers/:id` - Delete a customer nobody has sold to (Admin, Roaster)

### Sale Orders

Roasted coffee sold from roast batches. A Roaster sees and changes only their own sales.

- `GET /api/sale-orders` - The sales log
- `POST /api/sale-orders` - Record a sale
- `GET /api/sale-orders/:id` - Get sale order by ID
- `PUT /api/sale-orders/:id` - Edit a sale (lines, customer, date, currency, notes, status)
- `DELETE /api/sale-orders/:id` - Delete a sale (its kg go back to the roasts)

### Invoices

- `GET /api/invoices` - List all invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/:id` - Get invoice by ID
- `PUT /api/invoices/:id` - Update invoice

### Pricing History

- `GET /api/pricing-history` - List all pricing history
- `POST /api/pricing-history` - Create pricing history entry

### System

- `GET /api/health` - Health check
- `GET /api/data-version` - Get data version for cache invalidation
- `GET /api/bulk-load` - Bulk load data
- `POST /api/backfill-display-ids` - Backfill display IDs (Admin only)

## Authentication

All API endpoints (except public auth routes and `/api/trace/:publicId`) require authentication via JWT token.

The token can be provided in two ways:
1. **HTTP-only Cookie:** Set automatically after login
2. **Authorization Header:** `Authorization: Bearer <token>`

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message here"
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `503` - Database Unavailable
- `500` - Internal Server Error

## Database Management

```bash
# Open Prisma Studio (GUI)
npm run db:studio
# Opens at http://localhost:5555

# Push schema changes directly (development)
npx prisma db push

# Create new migration
npm run db:migrate

# Deploy migrations (production)
npx prisma migrate deploy

# Reset database (WARNING: deletes all data!)
npx prisma migrate reset
```

## Project Structure

```
backend/
├── src/
│   ├── app/
│   │   └── api/              # API routes (Next.js App Router)
│   │       ├── auth/         # Authentication endpoints
│   │       ├── farms/        # Farm management + collaborators
│   │       ├── harvest-lots/ # Harvest lot management
│   │       ├── ...           # Other feature routes
│   │       └── health/       # Health check
│   └── lib/                  # Core utilities
│       ├── prisma.ts         # Prisma client singleton
│       ├── auth.ts           # JWT + bcrypt helpers
│       ├── middleware.ts     # requireAuth, handleApiError
│       ├── validations/      # Zod validation schemas
│       └── email.ts          # Email service (Resend)
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── seed.ts               # Seed script
│   └── migrations/           # Migration files
└── .env                      # Environment variables
```

## Production

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET` (min 32 chars)
3. Configure `DATABASE_URL` pointing to production DB
4. Set `FRONTEND_URL` to production frontend URL
5. Set `GEMINI_API_KEY` to enable the AI buttons (backend only, see above)
6. Run `npm run build` then `npm start`

## License

Private - Coffee Lab Platform
