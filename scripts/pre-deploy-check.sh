#!/bin/bash
# Pre-deployment check script (Vercel/any platform)
# This script runs all checks that should pass before deploying

set -e  # Exit on any error

echo "🔍 Starting pre-deployment checks..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error
error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    error "Must run from repo root directory"
    exit 1
fi

success "Found package.json in repo root"

# Check if Node.js version is correct
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" != "20" ]; then
    warning "Node.js version is $NODE_VERSION, recommended is 20.x"
else
    success "Node.js version is correct ($NODE_VERSION.x)"
fi

# Check if package-lock.json exists
if [ ! -f "package-lock.json" ]; then
    error "package-lock.json is missing. Run 'npm install' first."
    exit 1
fi
success "package-lock.json exists"

# Check if .env.sample exists
if [ ! -f ".env.sample" ]; then
    warning ".env.sample file is missing"
else
    success ".env.sample exists"
fi

# Check if vercel.json exists (optional - Vercel can auto-detect)
if [ -f "vercel.json" ]; then
    success "vercel.json exists (optional)"
else
    warning "vercel.json not found (optional - Vercel can auto-detect Next.js)"
fi

# Check if frontend directory exists
if [ ! -d "apps/frontend" ]; then
    error "apps/frontend directory is missing"
    exit 1
fi
success "apps/frontend directory exists"

# Check if frontend package.json exists
if [ ! -f "apps/frontend/package.json" ]; then
    error "apps/frontend/package.json is missing"
    exit 1
fi
success "apps/frontend/package.json exists"

# Check if required frontend files exist
REQUIRED_FILES=(
    "apps/frontend/next.config.js"
    "apps/frontend/tsconfig.json"
    "apps/frontend/tailwind.config.js"
    "apps/frontend/postcss.config.js"
    "apps/frontend/app/layout.tsx"
    "apps/frontend/app/page.tsx"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        error "Required file is missing: $file"
        exit 1
    fi
done
success "All required frontend files exist"

echo ""
echo "📦 Installing dependencies..."
npm ci --silent
success "Dependencies installed"

echo ""
echo "🔍 Running TypeScript type check..."
cd apps/frontend
npx tsc --noEmit
if [ $? -eq 0 ]; then
    success "TypeScript type check passed"
else
    error "TypeScript type check failed"
    exit 1
fi
cd ../..

echo ""
echo "🔍 Running ESLint..."
npm run lint:frontend
if [ $? -eq 0 ]; then
    success "ESLint check passed"
else
    warning "ESLint found warnings (these won't block deployment)"
fi

echo ""
echo "🏗️  Running build test..."
cd apps/frontend
npm run build
if [ $? -eq 0 ]; then
    success "Build test passed"
else
    error "Build test failed"
    exit 1
fi
cd ../..

echo ""
echo "✅ All pre-deployment checks passed!"
echo ""
echo "📋 Summary:"
echo "  - Node.js version: $(node -v)"
echo "  - npm version: $(npm -v)"
echo "  - TypeScript: ✅"
echo "  - ESLint: ✅"
echo "  - Build: ✅"
echo ""
echo "🚀 Ready to deploy!"
