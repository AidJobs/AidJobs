import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
    
    // Remove cache busting parameter before forwarding
    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete('_t');
    
    const response = await fetch(`${backendUrl}/api/admin/jobs/search?${cleanParams.toString()}`, {
      headers: {
        'Cookie': request.headers.get('cookie') || '',
        'Cache-Control': 'no-cache',
      },
      credentials: 'include',
      cache: 'no-store',  // Prevent caching
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      return NextResponse.json(
        { status: 'error', ...errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error searching jobs:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

