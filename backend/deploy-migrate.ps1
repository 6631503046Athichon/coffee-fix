# PowerShell script for deployment with migration
# Usage: .\deploy-migrate.ps1

Write-Host "Starting deployment with migration..." -ForegroundColor Cyan

# Step 1: Generate Prisma Client
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to generate Prisma Client" -ForegroundColor Red
    exit 1
}

# Step 2: Deploy migrations
Write-Host "Deploying migrations..." -ForegroundColor Yellow
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to deploy migrations" -ForegroundColor Red
    exit 1
}

# Step 3: Build application
Write-Host "Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build application" -ForegroundColor Red
    exit 1
}

Write-Host "Deployment completed successfully!" -ForegroundColor Green

