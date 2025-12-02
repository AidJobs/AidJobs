import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
    
    console.log('[diagnose-search-vs-db-proxy] Forwarding to:', `${backendUrl}/api/admin/jobs/diagnose/search-vs-db`);
    
    const response = await fetch(`${backendUrl}/api/admin/jobs/diagnose/search-vs-db`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
    });

    console.log('[diagnose-search-vs-db-proxy] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[diagnose-search-vs-db-proxy] Error response:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: `HTTP ${response.status}`, detail: errorText };
      }
      return NextResponse.json(
        { status: 'error', ...errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[diagnose-search-vs-db-proxy] Response data:', JSON.stringify(data, null, 2));
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[diagnose-search-vs-db-proxy] Error:', error);
    return NextResponse.json(
      { status: 'error', error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

