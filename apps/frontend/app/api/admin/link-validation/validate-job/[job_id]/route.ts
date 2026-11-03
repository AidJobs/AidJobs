import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ job_id: string }> }) {
  const { job_id: jobId } = await props.params;
  return proxyToBackend({
    route: 'POST /api/admin/link-validation/validate-job/[job_id]',
    path: `/api/admin/link-validation/validate-job/${encodeURIComponent(jobId)}`,
    method: 'POST',
    session: req,
    errorBody: adminErrorBody,
  });
}
