import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.toString();
  return proxyToBackend({
    route: 'GET /api/admin/crawl/logs',
    path: `/api/admin/crawl/logs${query ? `?${query}` : ''}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
