import { NextRequest, NextResponse } from 'next/server';
import { adminBackendFetch } from '@/lib/adminBackend';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_HOST_COOKIE,
  clearedSessionCookieOptions,
  sessionRequestSecure,
} from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await adminBackendFetch(req, '/api/admin/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout proxy error:', error);
  }

  const secure = sessionRequestSecure(req);
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_SESSION_HOST_COOKIE, '', clearedSessionCookieOptions(true));
  response.cookies.set(ADMIN_SESSION_COOKIE, '', clearedSessionCookieOptions(secure));
  return response;
}
