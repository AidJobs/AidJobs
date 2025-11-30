import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
    });

    const data = await res.json();
    
    // Clear cookie by setting it to empty with expired date
    const responseHeaders: HeadersInit = {
      'Set-Cookie': 'aidjobs_admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax'
    };
    
    return NextResponse.json(data, { 
      status: res.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('Logout proxy error:', error);
    return NextResponse.json(
      { detail: 'Logout failed' },
      { status: 500 }
    );
  }
}

