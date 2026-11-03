import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const jobIds = req.nextUrl.searchParams.get('job_ids');
  return proxyToBackend({
    route: 'GET /api/admin/link-validation/stats',
    path: `/api/admin/link-validation/stats${jobIds ? `?job_ids=${encodeURIComponent(jobIds)}` : ''}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
