import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.toString();
  return proxyToBackend({
    route: 'GET /api/admin/observability/validation-errors',
    path: `/api/admin/observability/validation-errors${query ? `?${query}` : ''}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
