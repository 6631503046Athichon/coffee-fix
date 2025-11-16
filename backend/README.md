# Coffee Lab Backend

Backend API server for Coffee Lab Platform built with Next.js 14, Prisma ORM, and PostgreSQL.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **API Routes:** Next.js API Routes (`/app/api/*/route.ts`)
- **Database ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JWT + bcrypt
- **Language:** TypeScript

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

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

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:5173"

# Node Environment
NODE_ENV="development"
```

### 3. Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database with initial data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login user
- `POST /api/auth/register` - Register new user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Users

- `GET /api/users` - List all users (Admin only)
- `POST /api/users` - Create user (Admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Admin only)

### Farms

- `GET /api/farms` - List all farms
- `POST /api/farms` - Create farm
- `GET /api/farms/:id` - Get farm by ID
- `PUT /api/farms/:id` - Update farm
- `DELETE /api/farms/:id` - Delete farm (Admin only)

### Farm Requests

- `GET /api/farm-requests` - List all farm requests
- `POST /api/farm-requests` - Create farm request
- `GET /api/farm-requests/:id` - Get farm request by ID
- `PUT /api/farm-requests/:id` - Approve/reject farm request (Admin only)

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
- `PUT /api/parchment-lots/:id` - Update parchment lot (includes physical test results)
- `GET /api/parchment-lots/:id` - Get parchment lot by ID

### Green Bean Lots

- `GET /api/green-bean-lots` - List all green bean lots
- `POST /api/green-bean-lots` - Create green bean lot
- `GET /api/green-bean-lots/:id` - Get green bean lot by ID
- `PUT /api/green-bean-lots/:id` - Update green bean lot
- `POST /api/green-bean-lots/:id/withdrawals` - Create withdrawal

### Roaster Inventory

- `GET /api/roaster-inventory` - List all roaster inventory items
- `POST /api/roaster-inventory` - Claim green bean lot for roasting
- `GET /api/roaster-inventory/:id` - Get inventory item by ID
- `PUT /api/roaster-inventory/:id` - Update inventory item

### Roast Batches

- `GET /api/roast-batches` - List all roast batches
- `POST /api/roast-batches` - Create roast batch

### Cupping Sessions

- `GET /api/cupping-sessions` - List all cupping sessions
- `POST /api/cupping-sessions` - Create cupping session
- `GET /api/cupping-sessions/:id` - Get cupping session by ID
- `PUT /api/cupping-sessions/:id` - Update cupping session
- `POST /api/cupping-sessions/:id/samples` - Add sample to session
- `POST /api/cupping-sessions/:id/judges` - Add judge to session
- `POST /api/cupping-sessions/:id/scores` - Submit score for a sample

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

- `GET /api/weather-records` - List all weather records
- `POST /api/weather-records` - Create weather record

### Crop Years

- `GET /api/crop-years` - List all crop years
- `POST /api/crop-years` - Create crop year (Admin only)
- `GET /api/crop-years/:id` - Get crop year by ID
- `PUT /api/crop-years/:id` - Update crop year (Admin only)

### Customers

- `GET /api/customers` - List all customers
- `POST /api/customers` - Create customer
- `GET /api/customers/:id` - Get customer by ID
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer (Admin only)

### Sale Orders

- `GET /api/sale-orders` - List all sale orders
- `POST /api/sale-orders` - Create sale order
- `GET /api/sale-orders/:id` - Get sale order by ID
- `PUT /api/sale-orders/:id` - Update sale order

### Invoices

- `GET /api/invoices` - List all invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/:id` - Get invoice by ID
- `PUT /api/invoices/:id` - Update invoice

### Pricing History

- `GET /api/pricing-history` - List all pricing history
- `POST /api/pricing-history` - Create pricing history entry

## Authentication

All API endpoints (except `/api/auth/login` and `/api/auth/register`) require authentication via JWT token.

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
- `500` - Internal Server Error

## Database Management

### Prisma Studio

Open GUI to view and edit database:

```bash
npm run db:studio
```

Opens at: `http://localhost:5555`

### Migrations

```bash
# Create new migration
npm run db:migrate

# Reset database (WARNING: deletes all data!)
npx prisma migrate reset

# Deploy migrations (production)
npx prisma migrate deploy
```

## Development

### Project Structure

```
backend/
├── src/
│   ├── app/
│   │   └── api/          # API routes
│   └── lib/              # Core utilities
│       ├── prisma.ts     # Database client
│       ├── auth.ts       # Auth helpers
│       ├── middleware.ts # Middleware
│       └── email.ts      # Email service
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Seed script
└── .env                  # Environment variables
```

## Production

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET`
3. Configure proper `DATABASE_URL`
4. Set `FRONTEND_URL` to production frontend URL
5. Run `npm run build`
6. Start with `npm start`

## License

Private - Coffee Lab Platform
