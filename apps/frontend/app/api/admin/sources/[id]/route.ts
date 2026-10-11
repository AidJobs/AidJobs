import { NextRequest, NextResponse } from 'next/server';
import { adminAuthHeaders } from '@/lib/adminBackend';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const response = await fetch(`${backendUrl}/api/admin/sources/${params.id}`, {
      method: 'GET',
      headers: adminAuthHeaders(request),
    });
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Source detail proxy error:', error);
    return NextResponse.json({ status: 'error', error: 'Proxy error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    console.log(`[proxy] PATCH ${backendUrl}/api/admin/sources/${params.id}`);
    
    const response = await fetch(`${backendUrl}/api/admin/sources/${params.id}`, {
      method: 'PATCH',
      headers: adminAuthHeaders(request, {
        'Content-Type': 'application/json',
      }),
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
    console.log(`[proxy] DELETE ${backendUrl}/api/admin/sources/${params.id}`);
    
    const response = await fetch(`${backendUrl}/api/admin/sources/${params.id}`, {
      method: 'DELETE',
      headers: adminAuthHeaders(request),
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
