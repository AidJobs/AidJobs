import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyToBackend({
    route: 'GET /api/admin/observability/test',
    path: '/api/admin/observability/test',
    session: req,
    errorBody: adminErrorBody,
  });
}
