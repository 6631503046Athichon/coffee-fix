# PowerShell script for deployment with db push
# Usage: .\deploy-push.ps1

Write-Host "Starting deployment with db push..." -ForegroundColor Cyan

# Step 1: Generate Prisma Client
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to generate Prisma Client" -ForegroundColor Red
    exit 1
}

# Step 2: Push schema to database
Write-Host "Pushing schema to database..." -ForegroundColor Yellow
npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push schema to database" -ForegroundColor Red
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

