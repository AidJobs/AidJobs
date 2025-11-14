import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    console.log(`[proxy] PATCH ${backendUrl}/admin/sources/${params.id}`);
    
    const response = await fetch(`${backendUrl}/admin/sources/${params.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
      body: JSON.stringify(body),
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
        { status: 'error', error: errorData.detail || errorData.error || `HTTP ${response.status}: ${errorText}` },
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    console.log(`[proxy] DELETE ${backendUrl}/admin/sources/${params.id}`);
    
    const response = await fetch(`${backendUrl}/admin/sources/${params.id}`, {
      method: 'DELETE',
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
        { status: 'error', error: errorData.detail || errorData.error || `HTTP ${response.status}: ${errorText}` },
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
