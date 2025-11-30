import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const url = `${backendUrl}/api/admin/crawl/cleanup_expired`;
    console.log(`[proxy] POST ${url}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
      credentials: 'include',
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
      console.error('Cleanup expired error:', res.status, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${res.status}: Failed to cleanup expired jobs` };
      }
      
      return NextResponse.json(
        { status: 'error', error: errorData.error || errorData.detail || `HTTP ${res.status}: Failed to cleanup expired jobs` },
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
    console.error('Cleanup expired proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return NextResponse.json(
      { status: 'error', error: `Failed to connect to backend: ${errorMessage}` },
      { status: 500 }
    );
  }
}

