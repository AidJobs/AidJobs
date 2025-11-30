import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_id, deletion_type, trigger_crawl, dry_run, deletion_reason, export_data } = body;

    if (!source_id) {
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
      `${apiUrl}/api/admin/crawl/delete-jobs-by-source`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          source_id,
          deletion_type: deletion_type || 'soft',
          trigger_crawl: trigger_crawl || false,
          dry_run: dry_run || false,
          deletion_reason: deletion_reason || null,
          export_data: export_data || false,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', error: data.detail || 'Failed to delete jobs' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[delete-jobs-by-source] Error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

