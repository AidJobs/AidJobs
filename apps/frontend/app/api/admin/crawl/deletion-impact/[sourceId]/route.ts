import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { sourceId: string } }
) {
  try {
    const { sourceId } = params;

    if (!sourceId) {
      return NextResponse.json(
        { status: 'error', error: 'source_id is required' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 
      (typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.hostname}:8000` 
        : 'http://localhost:8000');

    const response = await fetch(
      `${apiUrl}/api/admin/crawl/deletion-impact/${sourceId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', error: data.detail || 'Failed to get deletion impact' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[deletion-impact] Error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

