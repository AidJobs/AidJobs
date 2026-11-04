import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend, readJsonBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: Props) {
  const { id } = await props.params;
  return proxyToBackend({
    route: 'GET /api/admin/sources/[id]',
    path: `/api/admin/sources/${encodeURIComponent(id)}`,
    session: req,
    errorBody: adminErrorBody,
  });
}

export async function PATCH(req: NextRequest, props: Props) {
  const { id } = await props.params;
  const body = await readJsonBody(req, adminErrorBody, true);
  if (!body.ok) return body.response;
  return proxyToBackend({
    route: 'PATCH /api/admin/sources/[id]',
    path: `/api/admin/sources/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body: body.value,
    session: req,
    errorBody: adminErrorBody,
  });
}

export async function DELETE(req: NextRequest, props: Props) {
  const { id } = await props.params;
  return proxyToBackend({
    route: 'DELETE /api/admin/sources/[id]',
    path: `/api/admin/sources/${encodeURIComponent(id)}`,
    method: 'DELETE',
    session: req,
    errorBody: adminErrorBody,
  });
}
