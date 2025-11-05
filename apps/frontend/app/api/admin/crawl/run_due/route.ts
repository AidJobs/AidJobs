import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/crawl/run_due`, {
      method: 'POST',
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Run due crawls proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to run due crawls' },
      { status: 500 }
    );
  }
}
