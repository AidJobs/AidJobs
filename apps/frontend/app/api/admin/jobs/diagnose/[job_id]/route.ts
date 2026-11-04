import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ job_id: string }> }) {
  const { job_id: jobId } = await props.params;
  return proxyToBackend({
    route: 'GET /api/admin/jobs/diagnose/[job_id]',
    path: `/api/admin/jobs/diagnose/${encodeURIComponent(jobId)}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
