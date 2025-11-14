import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/sources/${params.id}/export`, {
      method: 'GET',
      headers: {
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
    });

    // Handle 401 - redirect to login
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
        { status: 'error', error: errorData.error || errorData.detail || `HTTP ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, { 
      status: response.status,
      headers: {
        'Set-Cookie': response.headers.get('set-cookie') || '',
      },
    });
  } catch (error) {
    console.error('API proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return NextResponse.json(
      { status: 'error', error: `Failed to connect to backend: ${errorMessage}` },
      { status: 500 }
    );
  }
}

