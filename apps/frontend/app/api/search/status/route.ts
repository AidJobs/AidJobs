import { proxyToBackend, statusErrorBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyToBackend({
    route: 'GET /api/search/status',
    path: '/api/search/status',
    errorBody: statusErrorBody,
  });
}
