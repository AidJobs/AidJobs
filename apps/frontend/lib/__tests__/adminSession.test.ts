import fs from 'fs';
import path from 'path';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_HOST_COOKIE,
  readBrowserSession,
  readMintedSession,
  sessionCookieName,
  sessionCookieOptions,
  sessionCookieSecure,
  sessionTokenFromSetCookie,
} from '../adminSession';
import { adminAuthHeaders } from '../adminBackend';

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.name === 'route.ts') found.push(full);
  }
  return found;
}

describe('admin session cookie', () => {
  it('uses the host cookie only on https', () => {
    expect(sessionCookieSecure('https:')).toBe(true);
    expect(sessionCookieSecure('http:', 'https')).toBe(true);
    expect(sessionCookieSecure('http:', 'http')).toBe(false);
    expect(sessionCookieName(true)).toBe(ADMIN_SESSION_HOST_COOKIE);
    expect(sessionCookieName(false)).toBe(ADMIN_SESSION_COOKIE);
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    expect(sessionCookieOptions(true)).not.toHaveProperty('domain');
  });

  it('reads the host cookie before the local cookie', () => {
    const cookies = {
      get: (name: string) => {
        if (name === ADMIN_SESSION_HOST_COOKIE) return { value: 'host-token' };
        if (name === ADMIN_SESSION_COOKIE) return { value: 'local-token' };
        return undefined;
      },
    };
    expect(readBrowserSession(cookies)).toBe('host-token');
  });

  it('reads the session from the server header before Set-Cookie', () => {
    const headers = {
      get: (name: string) => (name === 'x-aidjobs-admin-session' ? 'v1.payload.sig' : null),
      getSetCookie: () => ['aidjobs_admin_session=other; Path=/'],
    };
    expect(readMintedSession(headers)).toBe('v1.payload.sig');
  });

  it('reads one Set-Cookie value when the header is absent', () => {
    const cookies = [
      '__Host-aidjobs_admin_session=v1.payload.sig; HttpOnly; Max-Age=28800; Path=/; SameSite=lax; Secure',
    ];
    expect(sessionTokenFromSetCookie(cookies)).toBe('v1.payload.sig');
    expect(readMintedSession({ get: () => null, getSetCookie: () => cookies })).toBe('v1.payload.sig');
  });

  it('returns null when login did not mint a session', () => {
    expect(readMintedSession({ get: () => '   ', getSetCookie: () => [] })).toBeNull();
  });

  it('sends the decoded cookie as a header and drops the raw cookie', () => {
    const headers = adminAuthHeaders(
      {
        cookies: {
          get: (name: string) => (name === ADMIN_SESSION_COOKIE ? { value: 'v1.payload.sig' } : undefined),
        },
      },
      {
        cookie: 'aidjobs_admin_session=from-browser',
        'x-aidjobs-admin-session': 'from-browser',
        'Content-Type': 'application/json',
      }
    );
    expect(headers.get('x-aidjobs-admin-session')).toBe('v1.payload.sig');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('admin proxies do not forward browser cookies', () => {
    const root = path.join(__dirname, '../../app/api/admin');
    const offenders: string[] = [];
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, 'utf8').toLowerCase();
      if (text.includes(".get('cookie')") || text.includes('.get("cookie")') || text.includes('set-cookie')) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
