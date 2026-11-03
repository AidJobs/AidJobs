import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return proxyToBackend({
    route: 'GET /api/admin/sources/[id]/export',
    path: `/api/admin/sources/${encodeURIComponent(id)}/export`,
    session: req,
    errorBody: adminErrorBody,
  });
}
