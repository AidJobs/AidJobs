import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const response = await fetch(`${backendUrl}/api/admin/organisations`, {
      method: 'GET',
      headers: {
        Cookie: request.headers.get('cookie') || '',
      },
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Organisations proxy error:', error);
    return NextResponse.json({ status: 'error', error: 'Proxy error' }, { status: 500 });
  }
}
