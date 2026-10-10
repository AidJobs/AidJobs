import {
  readMintedSession,
  sessionCookieOptions,
  sessionCookieSecure,
  sessionTokenFromSetCookie,
} from '../adminSession';

describe('admin session cookie', () => {
  it('marks the cookie Secure only for an https page', () => {
    expect(sessionCookieSecure('https:')).toBe(true);
    expect(sessionCookieSecure('http:')).toBe(false);
    expect(sessionCookieOptions(false).secure).toBe(false);
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 8 * 60 * 60,
    });
  });

  it('reads the session from the server header before Set-Cookie', () => {
    const headers = {
      get: (name: string) => (name === 'x-aidjobs-admin-session' ? 'admin|1|abc' : null),
      getSetCookie: () => ['aidjobs_admin_session=other; Path=/'],
    };
    expect(readMintedSession(headers)).toBe('admin|1|abc');
  });

  it('reads one Set-Cookie value when the header is absent', () => {
    const cookies = [
      'aidjobs_admin_session=admin|99|sig; HttpOnly; Max-Age=28800; Path=/; SameSite=lax; Expires=Thu, 01 Jan 2030 00:00:00 GMT',
    ];
    expect(sessionTokenFromSetCookie(cookies)).toBe('admin|99|sig');
    expect(readMintedSession({ get: () => null, getSetCookie: () => cookies })).toBe('admin|99|sig');
  });

  it('returns null when login did not mint a session', () => {
    expect(readMintedSession({ get: () => '   ', getSetCookie: () => [] })).toBeNull();
  });
});
