import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/config-check`, {
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Config check proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to check config' },
      { status: 500 }
    );
  }
}

