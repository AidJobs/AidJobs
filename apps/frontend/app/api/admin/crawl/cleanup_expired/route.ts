import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return proxyToBackend({
    route: 'POST /api/admin/crawl/cleanup_expired',
    path: '/api/admin/crawl/cleanup_expired',
    method: 'POST',
    session: req,
    errorBody: adminErrorBody,
  });
}
