import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const execute = searchParams.get('execute') === 'true';
    
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const url = `${backendUrl}/api/admin/meilisearch/sync?execute=${execute}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
    });

    if (response.status === 401) {
      return NextResponse.json(
        { status: 'error', error: 'Authentication required', authenticated: false },
        { status: 401 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { detail: errorText };
      }
      return NextResponse.json(
        { status: 'error', error: errorData.detail || errorData.error || `HTTP ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Meilisearch sync proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return NextResponse.json(
      { status: 'error', error: `Failed to connect to backend: ${errorMessage}` },
      { status: 500 }
    );
  }
}

