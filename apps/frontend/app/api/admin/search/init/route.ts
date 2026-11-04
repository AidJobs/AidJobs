import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return proxyToBackend({
    route: 'POST /api/admin/search/init',
    path: '/api/admin/search/init',
    method: 'POST',
    session: req,
    errorBody: adminErrorBody,
  });
}
