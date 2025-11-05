import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryString = searchParams.toString();
    
    const res = await fetch(`${BACKEND_URL}/admin/crawl/logs${queryString ? `?${queryString}` : ''}`, {
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Crawl logs proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to fetch crawl logs' },
      { status: 500 }
    );
  }
}
