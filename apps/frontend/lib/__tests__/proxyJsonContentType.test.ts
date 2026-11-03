/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend, statusErrorBody } from '@/lib/backendProxy';

// The backend refuses a JSON body that does not say it is JSON (FastAPI 0.132 and later),
// so every proxy call that sends a body must set the JSON content type itself.
process.env.NEXT_PUBLIC_API_URL = 'http://backend.test/api';

const API_ROOT = path.join(__dirname, '../../app/api');
const CALLS: Record<string, number> = { fetch: 1, adminBackendFetch: 2 };
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

function routeName(file: string): string {
  return path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/');
}

/** The text between the call's parentheses, split into its top-level arguments. */
function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const end = text.indexOf(text[i + 1] === '/' ? '\n' : '*/', i + 2);
      if (end === -1) break;
      i = text[i + 1] === '/' ? end : end + 1;
    }
    else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        args.push(text.slice(start, i));
        return args.map((a) => a.trim()).filter(Boolean);
      }
    } else if (ch === ',' && depth === 1) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
  }
  throw new Error('unbalanced call');
}

function backendCalls() {
  const calls: { route: string; where: string; options: string | undefined }[] = [];
  for (const file of walk(API_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    const pattern = /\b(fetch|adminBackendFetch)\s*\(/g;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const args = callArguments(text, m.index + m[0].length - 1);
      const line = text.slice(0, m.index).split('\n').length;
      calls.push({
        route: routeName(file),
        where: `${path.relative(API_ROOT, file)}:${line}`,
        options: args[CALLS[m[1]]],
      });
    }
  }
  return calls;
}

describe('proxy routes that call the backend directly', () => {
  const calls = backendCalls();

  it('are only the sign-in routes', () => {
    expect([...new Set(calls.map((c) => c.route))].sort()).toEqual([...SIGN_IN].sort());
  });

  it('pass their request options inline, so this check can read them', () => {
    const unreadable = calls.filter(
      (c) => c.options !== undefined && (!c.options.startsWith('{') || c.options.includes('...'))
    );
    expect(unreadable.map((c) => c.where)).toEqual([]);
  });

  it('send a body only from sign-in, and label it JSON', () => {
    const withBody = calls.filter((c) => c.options && /\bbody\s*(:|,|\})/.test(c.options));
    expect(withBody.map((c) => c.route)).toEqual(['admin/login']);
    const unlabelled = withBody.filter(
      (c) => !/['"]content-type['"]\s*:\s*['"]application\/json['"]/i.test(c.options ?? '')
    );
    expect(unlabelled.map((c) => c.where)).toEqual([]);
  });
});

describe('proxy routes that send a body through lib/backendProxy', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
  });

  it('read the browser\'s body only through readJsonBody', () => {
    const readers = walk(API_ROOT)
      .filter((file) => !SIGN_IN.includes(routeName(file)))
      .filter((file) => /\bbody\s*:/.test(fs.readFileSync(file, 'utf8')));
    expect(readers.length).toBeGreaterThanOrEqual(11);
    for (const file of readers) {
      const text = fs.readFileSync(file, 'utf8');
      expect([routeName(file), /\breadJsonBody\s*\(/.test(text)]).toEqual([routeName(file), true]);
      expect([routeName(file), /\.json\s*\(\s*\)/.test(text)]).toEqual([routeName(file), false]);
    }
  });

  it.each([
    ['an admin call', { session: new NextRequest('http://site.test/x'), errorBody: adminErrorBody }],
    ['a public call', { errorBody: statusErrorBody }],
  ])('get the body labelled JSON by the helper (%s)', async (_name, extra) => {
    await proxyToBackend({ route: 'POST /api/x', path: '/api/x', method: 'POST', body: { a: 1 }, ...extra });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });
});
