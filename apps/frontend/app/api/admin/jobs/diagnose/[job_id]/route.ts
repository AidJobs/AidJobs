import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { job_id: string } }
) {
  try {
    const { job_id } = params;
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
    
    console.log('[diagnose-proxy] Forwarding to:', `${backendUrl}/api/admin/jobs/diagnose/${job_id}`);
    
    const response = await fetch(`${backendUrl}/api/admin/jobs/diagnose/${job_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
    });

    console.log('[diagnose-proxy] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[diagnose-proxy] Error response:', errorText);
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
    console.log('[diagnose-proxy] Response data:', JSON.stringify(data, null, 2));
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[diagnose-proxy] Error:', error);
    return NextResponse.json(
      { status: 'error', error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

