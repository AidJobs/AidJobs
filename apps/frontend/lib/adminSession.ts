export const ADMIN_SESSION_COOKIE = 'aidjobs_admin_session';
export const ADMIN_SESSION_HOST_COOKIE = '__Host-aidjobs_admin_session';
export const ADMIN_SESSION_HEADER = 'x-aidjobs-admin-session';
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export function sessionCookieSecure(protocol: string, forwardedProto?: string | null): boolean {
  if (protocol === 'https:') return true;
  const first = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  return first === 'https';
}

export function sessionCookieName(secure: boolean): string {
  return secure ? ADMIN_SESSION_HOST_COOKIE : ADMIN_SESSION_COOKIE;
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

export function clearedSessionCookieOptions(secure: boolean) {
  return {
    ...sessionCookieOptions(secure),
    maxAge: 0,
    expires: new Date(0),
  };
}

export function sessionRequestSecure(req: {
  nextUrl: { protocol: string };
  headers: { get(name: string): string | null };
}): boolean {
  return sessionCookieSecure(req.nextUrl.protocol, req.headers.get('x-forwarded-proto'));
}

export function readBrowserSession(cookieStore: CookieReader): string | null {
  const host = cookieStore.get(ADMIN_SESSION_HOST_COOKIE)?.value?.trim();
  if (host) return host;
  const local = cookieStore.get(ADMIN_SESSION_COOKIE)?.value?.trim();
  return local || null;
}

export function sessionTokenFromHeader(headers: { get(name: string): string | null }): string | null {
  const token = headers.get(ADMIN_SESSION_HEADER)?.trim();
  return token ? token : null;
}

export function sessionTokenFromSetCookie(setCookies: string[]): string | null {
  const names = new Set([ADMIN_SESSION_COOKIE, ADMIN_SESSION_HOST_COOKIE]);
  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (!names.has(name)) continue;
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
