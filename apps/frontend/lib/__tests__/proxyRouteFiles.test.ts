/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

// Security plan, stage 4: every proxy route under app/api calls the backend only through
// lib/backendProxy. The sign-in routes are the only exceptions; they set their own cookie and
// already answer with fixed text (stage 2).
const API_ROOT = path.join(__dirname, '../../app/api');
const SIGN_IN = ['admin/login', 'admin/logout', 'admin/session'];

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.name === 'route.ts') found.push(full);
  }
  return found;
}

const routes = walk(API_ROOT).map((file) => ({
  name: path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/'),
  file,
}));

describe('proxy route files', () => {
  it('are the 45 known files, so a new route cannot skip these checks unnoticed', () => {
    expect(routes).toHaveLength(45);
  });

  it('name each exception, and each exception exists', () => {
    const names = routes.map((r) => r.name);
    for (const name of SIGN_IN) expect(names).toContain(name);
  });

  it.each(routes.filter((r) => !SIGN_IN.includes(r.name)).map((r) => [r.name, r.file]))(
    '%s calls the backend only through lib/backendProxy, logs nothing, and handles no cookies',
    (_name, file) => {
      const text = fs.readFileSync(file as string, 'utf8');
      expect(text).toContain("from '@/lib/backendProxy'");
      expect(text).toMatch(/\bproxyToBackend\s*\(/);
      expect(text).not.toMatch(/\bconsole\./);
      expect(text).not.toMatch(/\bprocess\./);
      expect(text).not.toMatch(/\.message\b/);
      expect(text).not.toMatch(/\bfetch\s*\(/);
      expect(text).not.toMatch(/\badminBackendFetch\s*\(/);
      expect(text).not.toMatch(/\badminAuthHeaders\b/);
      expect(text).not.toMatch(/\.(json|text)\s*\(\s*\)/);
      expect(text).not.toMatch(/\bcookie/i);
    }
  );
});
