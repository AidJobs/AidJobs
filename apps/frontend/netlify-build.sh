#!/bin/bash
# Netlify build script for frontend
# This script ensures all dependencies are installed and the build succeeds

set -e  # Exit on error

echo "=== Netlify Build Script ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "Error: package.json not found. Are we in the frontend directory?"
  exit 1
fi

# Install dependencies
echo "=== Installing dependencies ==="
npm ci --prefer-offline --no-audit

# Run build
echo "=== Building Next.js application ==="
npm run build

echo "=== Build completed successfully ==="

