import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await props.params;
  return proxyToBackend({
    route: 'GET /api/admin/data-quality/source/[sourceId]',
    path: `/api/admin/data-quality/source/${encodeURIComponent(sourceId)}`,
    session: req,
    errorBody: adminErrorBody,
  });
}
