import { NextRequest, NextResponse } from 'next/server';
import { adminBackendOrigin } from '@/lib/adminBackend';
import {
  readMintedSession,
  sessionCookieName,
  sessionCookieOptions,
  sessionRequestSecure,
} from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

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
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return loginJson(
        { detail: data.detail || data.error || 'Invalid credentials' },
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
    return loginJson(
      { detail: 'Login failed. The admin service could not be reached.' },
      500
    );
  }
}
