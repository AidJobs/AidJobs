import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, sessionCookieOptions, sessionCookieSecure } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    await fetch(`${backendUrl}/api/admin/logout`, {
      method: 'POST',
      headers: {
        Cookie: req.headers.get('cookie') || '',
      },
      cache: 'no-store',
    });

    const response = NextResponse.json({ authenticated: false });
    response.cookies.set(ADMIN_SESSION_COOKIE, '', {
      ...sessionCookieOptions(sessionCookieSecure(req.nextUrl.protocol)),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error('Logout proxy error:', error);
    return NextResponse.json(
      { detail: 'Logout failed' },
      { status: 500 }
    );
  }
}
