import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend, readJsonBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, adminErrorBody, true);
  if (!body.ok) return body.response;
  return proxyToBackend({
    route: 'POST /api/admin/link-validation/validate',
    path: '/api/admin/link-validation/validate',
    method: 'POST',
    body: body.value,
    session: req,
    errorBody: adminErrorBody,
  });
}
