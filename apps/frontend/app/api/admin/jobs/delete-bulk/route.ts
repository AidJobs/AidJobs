import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
    
    console.log('[delete-bulk-proxy] Forwarding to:', `${backendUrl}/api/admin/jobs/delete-bulk`);
    console.log('[delete-bulk-proxy] Request body:', JSON.stringify(body, null, 2));
    
    const response = await fetch(`${backendUrl}/api/admin/jobs/delete-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    console.log('[delete-bulk-proxy] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[delete-bulk-proxy] Error response:', errorText);
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
    console.log('[delete-bulk-proxy] Success response:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[delete-bulk-proxy] Exception:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

