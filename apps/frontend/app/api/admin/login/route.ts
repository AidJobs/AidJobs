import { NextRequest, NextResponse } from 'next/server';
import { readMintedSession, sessionCookieOptions, sessionCookieSecure, ADMIN_SESSION_COOKIE } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');

    const res = await fetch(`${backendUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
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

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      token,
      sessionCookieOptions(sessionCookieSecure(req.nextUrl.protocol))
    );
    return response;
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { detail: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
