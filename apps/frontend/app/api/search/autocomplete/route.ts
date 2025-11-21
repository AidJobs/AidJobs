import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const searchParams = req.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    
    const url = `${backendUrl}/api/search/autocomplete?q=${encodeURIComponent(q)}`;
    console.log(`[proxy] GET ${url}`);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      console.error('Autocomplete error:', res.status, errorData);
      return NextResponse.json(
        { status: 'error', data: [], error: errorData.error || errorData.detail || `HTTP ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Autocomplete proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return NextResponse.json(
      { status: 'error', data: [], error: `Failed to connect to backend: ${errorMessage}` },
      { status: 500 }
    );
  }
}

