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
    const response = NextResponse.json(data, { status: res.status });
    // Append after the response exists so the clear is one Set-Cookie header.
    response.headers.append(
      'set-cookie',
      'aidjobs_admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax'
    );
    return response;
  } catch (error) {
    console.error('Logout proxy error:', error);
    return NextResponse.json(
      { detail: 'Logout failed' },
      { status: 500 }
    );
  }
}

