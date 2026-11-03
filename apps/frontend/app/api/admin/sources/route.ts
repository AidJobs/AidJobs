import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend, readJsonBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.toString();
  return proxyToBackend({
    route: 'GET /api/admin/sources',
    path: `/api/admin/sources${query ? `?${query}` : ''}`,
    session: req,
    errorBody: adminErrorBody,
  });
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, adminErrorBody, true);
  if (!body.ok) return body.response;
  return proxyToBackend({
    route: 'POST /api/admin/sources',
    path: '/api/admin/sources',
    method: 'POST',
    body: body.value,
    session: req,
    errorBody: adminErrorBody,
  });
}
