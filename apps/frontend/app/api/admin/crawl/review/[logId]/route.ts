import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ logId: string }> }) {
  const { logId } = await props.params;
  return proxyToBackend({
    route: 'GET /api/admin/crawl/review/[logId]',
    path: `/api/admin/crawl/review/${encodeURIComponent(logId)}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
