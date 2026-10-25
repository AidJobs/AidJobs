import { NextRequest, NextResponse } from 'next/server';
import { adminBackendOrigin } from '@/lib/adminBackend';
import {
  readMintedSession,
  sessionCookieName,
  sessionCookieOptions,
  sessionRequestSecure,
} from '@/lib/adminSession';
import { BACKEND_WAIT_MS } from '@/lib/admin/sessionCheck';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UNAVAILABLE = {
  detail: 'The admin service did not answer. It may be starting up; wait a moment and try again.',
  reason: 'unavailable',
};

function loginJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${adminBackendOrigin()}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      redirect: 'manual',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BACKEND_WAIT_MS),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (data === null && res.status >= 500) {
        return loginJson(UNAVAILABLE, 503);
      }
      return loginJson(
        { detail: data?.detail || data?.error || 'Invalid credentials' },
        res.status
      );
    }

    const token = readMintedSession(res.headers);
    if (!token) {
      return loginJson(
        { detail: 'Login failed. The session was not created.' },
        502
      );
    }

    const secure = sessionRequestSecure(req);
    const response = loginJson({ authenticated: true });
    response.cookies.set(sessionCookieName(secure), token, sessionCookieOptions(secure));
    return response;
  } catch (error) {
    console.error('Login proxy error:', error);
    return loginJson(UNAVAILABLE, 503);
  }
}
