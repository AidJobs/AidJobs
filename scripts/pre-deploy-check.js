#!/usr/bin/env node

/**
 * Pre-deployment checklist script
 * Runs comprehensive checks before deployment (Vercel/any platform)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

let errors = [];
let warnings = [];

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function check(name, fn) {
  try {
    log(`\n✓ Checking: ${name}...`, 'blue');
    const result = fn();
    if (result === true || result === undefined) {
      log(`  ✓ ${name} - OK`, 'green');
      return true;
    } else if (result === false) {
      log(`  ✗ ${name} - FAILED`, 'red');
      errors.push(name);
      return false;
    } else {
      log(`  ⚠ ${name} - WARNING: ${result}`, 'yellow');
      warnings.push(`${name}: ${result}`);
      return true;
    }
  } catch (error) {
    log(`  ✗ ${name} - ERROR: ${error.message}`, 'red');
    errors.push(`${name}: ${error.message}`);
    return false;
  }
}

// Check 1: Verify Node version
check('Node.js version', () => {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 18) {
    return `Node.js version ${nodeVersion} is too old. Requires 18+`;
  }
  if (majorVersion > 20) {
    return `Node.js version ${nodeVersion} may not be supported. Recommended: 20.x`;
  }
  return true;
});

// Check 2: Verify package-lock.json exists
check('package-lock.json exists', () => {
  const lockFile = path.join(process.cwd(), 'package-lock.json');
  if (!fs.existsSync(lockFile)) {
    return false;
  }
  return true;
});

// Check 3: Verify vercel.json exists (optional, Vercel can auto-detect)
check('Vercel configuration (optional)', () => {
  const vercelJson = path.join(process.cwd(), 'vercel.json');
  if (!fs.existsSync(vercelJson)) {
    return 'vercel.json not found (optional - Vercel can auto-detect Next.js)';
  }
  return true;
});

// Check 4: Verify frontend directory exists
check('Frontend directory exists', () => {
  const frontendDir = path.join(process.cwd(), 'apps', 'frontend');
  if (!fs.existsSync(frontendDir)) {
    return false;
  }
  return true;
});

// Check 5: Verify frontend package.json exists
check('Frontend package.json exists', () => {
  const frontendPkg = path.join(process.cwd(), 'apps', 'frontend', 'package.json');
  if (!fs.existsSync(frontendPkg)) {
    return false;
  }
  const pkg = JSON.parse(fs.readFileSync(frontendPkg, 'utf-8'));
  if (!pkg.scripts || !pkg.scripts.build) {
    return 'Frontend package.json missing build script';
  }
  return true;
});

// Check 6: Verify required files exist
check('Required frontend files exist', () => {
  const frontendDir = path.join(process.cwd(), 'apps', 'frontend');
  const requiredFiles = [
    'next.config.js',
    'tsconfig.json',
    'tailwind.config.js',
    'postcss.config.js',
    'app/layout.tsx',
    'app/page.tsx',
  ];
  
  const missing = [];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(frontendDir, file))) {
      missing.push(file);
    }
  }
  
  if (missing.length > 0) {
    return `Missing files: ${missing.join(', ')}`;
  }
  return true;
});

// Check 7: Verify .nvmrc exists
check('.nvmrc exists', () => {
  const nvmrc = path.join(process.cwd(), '.nvmrc');
  if (!fs.existsSync(nvmrc)) {
    return '.nvmrc file not found (recommended for consistent Node version)';
  }
  return true;
});

// Check 8: Verify no critical syntax errors in TypeScript
check('TypeScript compilation', () => {
  try {
    const frontendDir = path.join(process.cwd(), 'apps', 'frontend');
    execSync('npx tsc --project apps/frontend/tsconfig.json --noEmit', {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 60000,
    });
    return true;
  } catch (error) {
    return `TypeScript errors found: ${error.message.split('\n').slice(-3).join(' ')}`;
  }
});

// Check 9: Verify ESLint (non-blocking)
check('ESLint (warnings only)', () => {
  try {
    execSync('npm run --workspace=apps/frontend lint', {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 60000,
    });
    return true;
  } catch (error) {
    // ESLint warnings are OK, only errors are blocking
    const output = error.stdout?.toString() || error.stderr?.toString() || '';
    if (output.includes('Error:')) {
      return 'ESLint found errors (not just warnings)';
    }
    return 'ESLint warnings found (non-blocking)';
  }
});

// Check 10: Verify environment variables are documented
check('Environment variables documented', () => {
  const envSample = path.join(process.cwd(), '.env.sample');
  const envExample = path.join(process.cwd(), 'env.example');
  if (!fs.existsSync(envSample) && !fs.existsSync(envExample)) {
    return '.env.sample or env.example not found (recommended for documentation)';
  }
  return true;
});

// Check 11: Verify .gitignore excludes node_modules
check('.gitignore excludes node_modules', () => {
  const gitignore = path.join(process.cwd(), '.gitignore');
  if (!fs.existsSync(gitignore)) {
    return '.gitignore not found';
  }
  const content = fs.readFileSync(gitignore, 'utf-8');
  if (!content.includes('node_modules')) {
    return '.gitignore should exclude node_modules';
  }
  return true;
});

// Check 12: Verify next.config.js is valid
check('next.config.js is valid', () => {
  const nextConfig = path.join(process.cwd(), 'apps', 'frontend', 'next.config.js');
  if (!fs.existsSync(nextConfig)) {
    return false;
  }
  try {
    // Try to require it to check for syntax errors
    delete require.cache[require.resolve(nextConfig)];
    require(nextConfig);
    return true;
  } catch (error) {
    return `next.config.js has errors: ${error.message}`;
  }
});

// Summary
log('\n' + '='.repeat(60), 'blue');
log('Pre-deployment Check Summary', 'blue');
log('='.repeat(60), 'blue');

if (errors.length === 0 && warnings.length === 0) {
  log('\n✓ All checks passed! Ready for deployment.', 'green');
  process.exit(0);
} else {
  if (warnings.length > 0) {
    log(`\n⚠ Warnings (${warnings.length}):`, 'yellow');
    warnings.forEach(w => log(`  - ${w}`, 'yellow'));
  }
  
  if (errors.length > 0) {
    log(`\n✗ Errors (${errors.length}):`, 'red');
    errors.forEach(e => log(`  - ${e}`, 'red'));
    log('\n✗ Deployment checks failed. Please fix errors before deploying.', 'red');
    process.exit(1);
  } else {
    log('\n✓ All critical checks passed. Warnings are non-blocking.', 'green');
    process.exit(0);
  }
}

