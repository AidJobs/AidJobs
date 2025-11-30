import { NextRequest, NextResponse } from 'next/server';

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
    
    // Forward Set-Cookie header from backend
    const setCookieHeader = res.headers.get('set-cookie');
    const responseHeaders: HeadersInit = {};
    if (setCookieHeader) {
      responseHeaders['Set-Cookie'] = setCookieHeader;
    }
    
    return NextResponse.json(data, { 
      status: res.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { detail: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}

