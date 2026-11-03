import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete('_t');
  const query = params.toString();
  return proxyToBackend({
    route: 'GET /api/admin/jobs/search',
    path: `/api/admin/jobs/search${query ? `?${query}` : ''}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
