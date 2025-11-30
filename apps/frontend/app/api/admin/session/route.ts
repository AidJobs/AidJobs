import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const res = await fetch(`${backendUrl}/api/admin/session`, {
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
      credentials: 'include',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Session check proxy error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}

