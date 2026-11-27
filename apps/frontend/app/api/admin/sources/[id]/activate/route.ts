import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return proxyToBackend({
    route: 'POST /api/admin/sources/[id]/activate',
    path: `/api/admin/sources/${encodeURIComponent(id)}/activate`,
    method: 'POST',
    session: req,
    errorBody: adminErrorBody,
  });
}
