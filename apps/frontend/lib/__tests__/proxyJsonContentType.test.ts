/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

// The backend refuses a JSON body that does not say it is JSON (FastAPI 0.132 and later),
// so every proxy call that sends a body must set the JSON content type itself.

const API_ROOT = path.join(__dirname, '../../app/api');
const CALLS: Record<string, number> = { fetch: 1, adminBackendFetch: 2 };

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.name === 'route.ts') found.push(full);
  }
  return found;
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
  const calls: { where: string; options: string | undefined }[] = [];
  for (const file of walk(API_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    const pattern = /\b(fetch|adminBackendFetch)\s*\(/g;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const args = callArguments(text, m.index + m[0].length - 1);
      const line = text.slice(0, m.index).split('\n').length;
      calls.push({ where: `${path.relative(API_ROOT, file)}:${line}`, options: args[CALLS[m[1]]] });
    }
  }
  return calls;
}

describe('proxy routes', () => {
  const calls = backendCalls();

  it('pass their request options inline, so this check can read them', () => {
    const unreadable = calls.filter(
      (c) => c.options !== undefined && (!c.options.startsWith('{') || c.options.includes('...'))
    );
    expect(unreadable.map((c) => c.where)).toEqual([]);
  });

  it('label every body they send to the backend as JSON', () => {
    const withBody = calls.filter((c) => c.options && /\bbody\s*(:|,|\})/.test(c.options));
    // Routes that call lib/backendProxy send no body here; the helper labels it (its own tests).
    expect(withBody.length).toBeGreaterThanOrEqual(11);
    const unlabelled = withBody.filter(
      (c) => !/['"]content-type['"]\s*:\s*['"]application\/json['"]/i.test(c.options ?? '')
    );
    expect(unlabelled.map((c) => c.where)).toEqual([]);
  });
});
