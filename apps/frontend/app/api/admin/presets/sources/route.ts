import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/presets/sources`, {
      method: 'GET',
      headers: {
        'Cookie': request.headers.get('cookie') || '',
      },
    });

    const data = await response.json();
    
    return NextResponse.json(data, { 
      status: response.status,
      headers: {
        'Set-Cookie': response.headers.get('set-cookie') || '',
      },
    });
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Internal server error' },
      { status: 500 }
    );
  }
}

