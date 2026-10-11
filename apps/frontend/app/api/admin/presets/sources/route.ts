import { NextRequest, NextResponse } from 'next/server';
import { adminAuthHeaders } from '@/lib/adminBackend';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/presets/sources`, {
      method: 'GET',
      headers: adminAuthHeaders(request),
    });

    const data = await response.json();
    
    return NextResponse.json(data, { 
      status: response.status,
    });
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Internal server error' },
      { status: 500 }
    );
  }
}

