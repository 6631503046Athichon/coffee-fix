# Deployment Guide

## Prisma Database Migration

### Development (Local)

```powershell
# Option 1: Quick sync (no migration history)
npx prisma db push

# Option 2: Create migration (recommended)
npx prisma migrate dev --name your_migration_name
```

### Production Deployment

#### PowerShell (Windows)

**Option 1: Using db push (simple, no migration history)**
```powershell
.\deploy-push.ps1
```

**Option 2: Using migration (recommended for production)**
```powershell
.\deploy-migrate.ps1
```

#### Manual Commands (PowerShell)

**Option 1: db push**
```powershell
npx prisma generate
if ($?) { npx prisma db push }
if ($?) { npm run build }
```

**Option 2: migration**
```powershell
npx prisma generate
if ($?) { npx prisma migrate deploy }
if ($?) { npm run build }
```

#### Using npm scripts

```powershell
# Option 1: db push
npm run build:with-push

# Option 2: migration
npm run build:with-migrate
```

### For CI/CD (Vercel/Railway/Render)

**Build Command:**
```bash
# Option 1: db push
npx prisma generate && npx prisma db push && npm run build

# Option 2: migration (recommended)
npx prisma generate && npx prisma migrate deploy && npm run build
```

**Note:** CI/CD platforms usually use bash/sh, so `&&` works there.

## Differences

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| `db push` | Development | Fast, simple | No migration history, can't rollback |
| `migrate` | Production | Has history, can rollback | Requires migration files |

## Troubleshooting

### PowerShell `&&` Error

PowerShell doesn't support `&&` for command chaining. Use:
- `;` for sequential execution (continues even on error)
- `if ($?) { ... }` for conditional execution (stops on error)
- Use the provided `.ps1` scripts

### Example with error handling:
```powershell
npx prisma generate
if ($LASTEXITCODE -eq 0) {
    npx prisma db push
    if ($LASTEXITCODE -eq 0) {
        npm run build
    }
}
```

