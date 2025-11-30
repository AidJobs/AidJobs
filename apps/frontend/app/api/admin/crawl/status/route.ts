import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const url = `${backendUrl}/api/admin/crawl/status`;
    console.log(`[proxy] GET ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
      credentials: 'include',
      cache: 'no-store',
    });

    // Handle 401 - redirect to login
    if (res.status === 401) {
      return NextResponse.json(
        { status: 'error', error: 'Authentication required', authenticated: false },
        { status: 401 }
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('Crawl status error:', res.status, errorText);
      return NextResponse.json(
        { status: 'error', error: `HTTP ${res.status}: ${errorText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { 
      status: res.status,
      headers: {
        'Set-Cookie': res.headers.get('set-cookie') || '',
      },
    });
  } catch (error) {
    console.error('Crawl status proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return NextResponse.json(
      { status: 'error', error: `Failed to connect to backend: ${errorMessage}` },
      { status: 500 }
    );
  }
}
