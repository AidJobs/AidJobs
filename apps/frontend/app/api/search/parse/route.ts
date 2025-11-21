import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const body = await req.json();
    const query = body.query || '';
    
    const url = `${backendUrl}/api/search/parse`;
    console.log(`[proxy] POST ${url}`, { query: query.substring(0, 50) });
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      console.error('Parse query error:', res.status, errorData);
      return NextResponse.json(
        { status: 'error', data: null, error: errorData.error || errorData.detail || `HTTP ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Parse query proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return NextResponse.json(
      { status: 'error', data: null, error: `Failed to connect to backend: ${errorMessage}` },
      { status: 500 }
    );
  }
}

