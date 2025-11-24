import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') || '50';
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const url = `${backendUrl}/admin/enrichment/unenriched-jobs?limit=${limit}`;
    console.log(`[proxy] GET ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
      credentials: 'include',
      cache: 'no-store',
    });

    if (res.status === 401) {
      return NextResponse.json(
        { status: 'error', error: 'Authentication required', authenticated: false },
        { status: 401 }
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('Unenriched jobs error:', res.status, errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${res.status}` };
      }
      return NextResponse.json(
        { status: 'error', ...errorData },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Unenriched jobs proxy error:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Failed to fetch unenriched jobs' 
      },
      { status: 500 }
    );
  }
}

