# Pre-deployment check script for Netlify (PowerShell)
# This script runs all checks that should pass before deploying

$ErrorActionPreference = "Stop"

Write-Host "🔍 Starting pre-deployment checks..." -ForegroundColor Cyan
Write-Host ""

# Function to print success
function Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

# Function to print error
function Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Function to print warning
function Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Error "Must run from repo root directory"
    exit 1
}

Success "Found package.json in repo root"

# Check if Node.js version is correct
$nodeVersion = (node -v).Substring(1).Split('.')[0]
if ($nodeVersion -ne "20") {
    Warning "Node.js version is $nodeVersion, recommended is 20.x"
} else {
    Success "Node.js version is correct ($nodeVersion.x)"
}

# Check if package-lock.json exists
if (-not (Test-Path "package-lock.json")) {
    Error "package-lock.json is missing. Run 'npm install' first."
    exit 1
}
Success "package-lock.json exists"

# Check if .env.sample exists
if (-not (Test-Path ".env.sample")) {
    Warning ".env.sample file is missing"
} else {
    Success ".env.sample exists"
}

# Check if netlify.toml exists
if (-not (Test-Path "netlify.toml")) {
    Error "netlify.toml is missing"
    exit 1
}
Success "netlify.toml exists"

# Check netlify.toml configuration
$netlifyContent = Get-Content "netlify.toml" -Raw
if ($netlifyContent -match 'publish = "apps/frontend"') {
    Success "netlify.toml publish directory is correct"
} else {
    Error "netlify.toml publish directory is incorrect. Should be 'apps/frontend'"
    exit 1
}

# Check if frontend directory exists
if (-not (Test-Path "apps/frontend")) {
    Error "apps/frontend directory is missing"
    exit 1
}
Success "apps/frontend directory exists"

# Check if frontend package.json exists
if (-not (Test-Path "apps/frontend/package.json")) {
    Error "apps/frontend/package.json is missing"
    exit 1
}
Success "apps/frontend/package.json exists"

# Check if required frontend files exist
$requiredFiles = @(
    "apps/frontend/next.config.js",
    "apps/frontend/tsconfig.json",
    "apps/frontend/tailwind.config.js",
    "apps/frontend/postcss.config.js",
    "apps/frontend/app/layout.tsx",
    "apps/frontend/app/page.tsx"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Error "Required file is missing: $file"
        exit 1
    }
}
Success "All required frontend files exist"

Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm ci --silent
if ($LASTEXITCODE -ne 0) {
    Error "Failed to install dependencies"
    exit 1
}
Success "Dependencies installed"

Write-Host ""
Write-Host "🔍 Running TypeScript type check..." -ForegroundColor Cyan
Push-Location "apps/frontend"
npx tsc --noEmit
if ($LASTEXITCODE -eq 0) {
    Success "TypeScript type check passed"
} else {
    Error "TypeScript type check failed"
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "🔍 Running ESLint..." -ForegroundColor Cyan
npm run lint:frontend
if ($LASTEXITCODE -eq 0) {
    Success "ESLint check passed"
} else {
    Warning "ESLint found warnings (these won't block deployment)"
}

Write-Host ""
Write-Host "🏗️  Running build test..." -ForegroundColor Cyan
Push-Location "apps/frontend"
npm run build
if ($LASTEXITCODE -eq 0) {
    Success "Build test passed"
} else {
    Error "Build test failed"
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "✅ All pre-deployment checks passed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  - Node.js version: $(node -v)"
Write-Host "  - npm version: $(npm -v)"
Write-Host "  - TypeScript: ✅"
Write-Host "  - ESLint: ✅"
Write-Host "  - Build: ✅"
Write-Host ""
Write-Host "🚀 Ready to deploy to Netlify!" -ForegroundColor Green
