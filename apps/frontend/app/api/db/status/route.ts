import { proxyToBackend, statusErrorBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyToBackend({ route: 'GET /api/db/status', path: '/api/db/status', errorBody: statusErrorBody });
}
