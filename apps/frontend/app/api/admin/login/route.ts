import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    
    const res = await fetch(`${backendUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    const data = await res.json();
    const response = NextResponse.json(data, { status: res.status });
    // get('set-cookie') joins every cookie into one header. A second cookie
    // with an Expires date makes that header illegal, so the browser drops it.
    for (const cookie of res.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie);
    }
    return response;
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { detail: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}

