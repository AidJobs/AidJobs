import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { sourceId: string } }
) {
  try {
    const { sourceId } = params;
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api$/, '');
    const response = await fetch(`${backendUrl}/api/admin/data-quality/source/${sourceId}`, {
      headers: {
        'Cookie': request.headers.get('cookie') || '',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', error: `Backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching source data quality:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

