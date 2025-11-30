import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  try {
    // Ensure BACKEND_URL doesn't have trailing /api
    const backendUrl = BACKEND_URL.replace(/\/api$/, '');
    const res = await fetch(`${backendUrl}/api/admin/domain_policies/${params.host}`, {
      headers: {
        'Cookie': req.headers.get('cookie') || '',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Domain policy fetch proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to fetch domain policy' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  try {
    const body = await req.json();
    
    const res = await fetch(`${BACKEND_URL}/admin/domain_policies/${params.host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Domain policy save proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to save domain policy' },
      { status: 500 }
    );
  }
}
