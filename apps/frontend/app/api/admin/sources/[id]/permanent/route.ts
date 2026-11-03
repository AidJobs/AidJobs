import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return proxyToBackend({
    route: 'DELETE /api/admin/sources/[id]/permanent',
    path: `/api/admin/sources/${encodeURIComponent(id)}/permanent`,
    method: 'DELETE',
    session: req,
    errorBody: adminErrorBody,
  });
}
