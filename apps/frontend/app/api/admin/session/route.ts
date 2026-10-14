import { NextRequest, NextResponse } from 'next/server';
import { adminBackendFetch } from '@/lib/adminBackend';
import { readBrowserSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

function sessionJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function GET(req: NextRequest) {
  if (!readBrowserSession(req.cookies)) {
    return sessionJson({ authenticated: false, reason: 'missing' });
  }

  try {
    const res = await adminBackendFetch(req, '/api/admin/session');
    const data = await res.json().catch(() => ({ authenticated: false }));
    if (res.ok && data.authenticated === true) {
      return sessionJson({ authenticated: true });
    }
    return sessionJson({ authenticated: false, reason: 'invalid' }, 401);
  } catch (error) {
    console.error('Session check proxy error:', error);
    return sessionJson({ authenticated: false, reason: 'invalid' }, 500);
  }
}
