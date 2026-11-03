import { NextRequest } from 'next/server';
import { proxyToBackend, readJsonBody, type ErrorBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

const errorBody: ErrorBody = (message) => ({ status: 'error', data: null, error: message });

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, errorBody);
  if (!body.ok) return body.response;
  const value = (body.value as { query?: unknown } | null)?.query;
  const query = typeof value === 'string' ? value : '';
  return proxyToBackend({
    route: 'POST /api/search/parse',
    path: '/api/search/parse',
    method: 'POST',
    body: { query },
    errorBody,
  });
}
