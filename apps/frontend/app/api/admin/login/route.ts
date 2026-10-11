import { NextRequest, NextResponse } from 'next/server';
import { adminBackendOrigin } from '@/lib/adminBackend';
import {
  readMintedSession,
  sessionCookieName,
  sessionCookieOptions,
  sessionRequestSecure,
} from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json(
        { detail: data.detail || data.error || 'Invalid credentials' },
        { status: res.status }
      );
    }

    const token = readMintedSession(res.headers);
    if (!token) {
      return NextResponse.json(
        { detail: 'Login failed. The session was not created.' },
        { status: 502 }
      );
    }

    const secure = sessionRequestSecure(req);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(sessionCookieName(secure), token, sessionCookieOptions(secure));
    return response;
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { detail: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
