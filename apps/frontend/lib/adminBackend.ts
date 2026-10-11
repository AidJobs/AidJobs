import { ADMIN_SESSION_HEADER, readBrowserSession } from './adminSession';

type SessionRequest = {
  cookies: { get(name: string): { value: string } | undefined };
};

export function adminBackendOrigin(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
}

export function adminAuthHeaders(req: SessionRequest, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.delete('cookie');
  headers.delete(ADMIN_SESSION_HEADER);
  const token = readBrowserSession(req.cookies);
  if (token) headers.set(ADMIN_SESSION_HEADER, token);
  return headers;
}

export function adminBackendFetch(req: SessionRequest, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = adminAuthHeaders(req, init.headers);
  return fetch(`${adminBackendOrigin()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  });
}
