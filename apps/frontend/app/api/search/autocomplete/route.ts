import { NextRequest } from 'next/server';
import { proxyToBackend, type ErrorBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

const errorBody: ErrorBody = (message) => ({ status: 'error', data: [], error: message });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  return proxyToBackend({
    route: 'GET /api/search/autocomplete',
    path: `/api/search/autocomplete?q=${encodeURIComponent(q)}`,
    errorBody,
  });
}
