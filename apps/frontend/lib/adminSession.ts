export const ADMIN_SESSION_COOKIE = 'aidjobs_admin_session';
export const ADMIN_SESSION_HEADER = 'x-aidjobs-admin-session';
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

export function sessionCookieSecure(protocol: string): boolean {
  return protocol === 'https:';
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  };
}

export function sessionTokenFromHeader(headers: { get(name: string): string | null }): string | null {
  const token = headers.get(ADMIN_SESSION_HEADER)?.trim();
  return token ? token : null;
}

export function sessionTokenFromSetCookie(setCookies: string[]): string | null {
  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (name !== ADMIN_SESSION_COOKIE) continue;
    let value = pair.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    return value || null;
  }
  return null;
}

export function readMintedSession(
  headers: { get(name: string): string | null; getSetCookie?: () => string[] }
): string | null {
  return sessionTokenFromHeader(headers) || sessionTokenFromSetCookie(headers.getSetCookie?.() ?? []);
}
