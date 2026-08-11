# PowerShell script for deployment with migration
# Usage (run from backend/): .\scripts\win\deploy-migrate.ps1

Write-Host "Starting deployment with migration..." -ForegroundColor Cyan

# Stop processes that may lock Prisma engine on Windows
Write-Host "Stopping node/next processes that may lock Prisma engine..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process next -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Clean Prisma generated client to avoid EPERM rename issues
Write-Host "Cleaning Prisma generated client cache..." -ForegroundColor Yellow
$backendRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)  # scripts\win -> backend
$prismaClientPath = Join-Path $backendRoot "node_modules\.prisma\client"
if (Test-Path $prismaClientPath) {
    Remove-Item $prismaClientPath -Recurse -Force -ErrorAction SilentlyContinue
}

# Step 1: Generate Prisma Client
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
npx --no-install prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to generate Prisma Client" -ForegroundColor Red
    exit 1
}

# Step 2: Deploy migrations
Write-Host "Deploying migrations..." -ForegroundColor Yellow
npx --no-install prisma migrate deploy
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

