import { NextRequest } from 'next/server';
import { proxyToBackend, type ErrorBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

const errorBody: ErrorBody = (message, _kind, requestId) => ({
  ok: false,
  status: 'error',
  error: message,
  detail: message,
  ...(requestId ? { request_id: requestId } : {}),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return proxyToBackend({
    route: 'POST /api/admin/sources/[id]/simulate_extract',
    path: `/api/admin/sources/${encodeURIComponent(id)}/simulate_extract`,
    method: 'POST',
    session: req,
    errorBody,
  });
}
