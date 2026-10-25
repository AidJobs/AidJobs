import { NextRequest, NextResponse } from 'next/server';
import { adminBackendFetch } from '@/lib/adminBackend';
import { readBrowserSession } from '@/lib/adminSession';
import { BACKEND_WAIT_MS } from '@/lib/admin/sessionCheck';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const res = await adminBackendFetch(req, '/api/admin/session', {
      signal: AbortSignal.timeout(BACKEND_WAIT_MS),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.authenticated === true) {
      return sessionJson({ authenticated: true });
    }
    if (res.status >= 500 || data === null) {
      return sessionJson({ authenticated: false, reason: 'unavailable' }, 503);
    }
    return sessionJson({ authenticated: false, reason: 'invalid' }, 401);
  } catch (error) {
    console.error('Session check proxy error:', error);
    return sessionJson({ authenticated: false, reason: 'unavailable' }, 503);
  }
}
