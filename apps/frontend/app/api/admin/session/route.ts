import { NextRequest, NextResponse } from 'next/server';
import { adminBackendFetch } from '@/lib/adminBackend';
import { readBrowserSession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!readBrowserSession(req.cookies)) {
    return NextResponse.json({ authenticated: false, reason: 'missing' });
  }

  try {
    const res = await adminBackendFetch(req, '/api/admin/session');
    const data = await res.json().catch(() => ({ authenticated: false }));
    if (res.ok && data.authenticated === true) {
      return NextResponse.json({ authenticated: true });
    }
    return NextResponse.json(
      { authenticated: false, reason: 'invalid' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Session check proxy error:', error);
    return NextResponse.json(
      { authenticated: false, reason: 'invalid' },
      { status: 500 }
    );
  }
}
