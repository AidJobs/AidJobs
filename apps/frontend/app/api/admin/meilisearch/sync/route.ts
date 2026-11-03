import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const execute = req.nextUrl.searchParams.get('execute') === 'true';
  return proxyToBackend({
    route: 'POST /api/admin/meilisearch/sync',
    path: `/api/admin/meilisearch/sync?execute=${execute}`,
    method: 'POST',
    session: req,
    errorBody: adminErrorBody,
  });
}
