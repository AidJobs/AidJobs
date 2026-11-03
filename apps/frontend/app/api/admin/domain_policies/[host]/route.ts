import { NextRequest } from 'next/server';
import { adminErrorBody, proxyToBackend, readJsonBody } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ host: string }> };

export async function GET(req: NextRequest, props: Props) {
  const { host } = await props.params;
  return proxyToBackend({
    route: 'GET /api/admin/domain_policies/[host]',
    path: `/api/admin/domain_policies/${encodeURIComponent(host)}`,
    session: req,
    errorBody: adminErrorBody,
  });
}

export async function POST(req: NextRequest, props: Props) {
  const { host } = await props.params;
  const body = await readJsonBody(req, adminErrorBody, true);
  if (!body.ok) return body.response;
  return proxyToBackend({
    route: 'POST /api/admin/domain_policies/[host]',
    path: `/api/admin/domain_policies/${encodeURIComponent(host)}`,
    method: 'POST',
    body: body.value,
    session: req,
    errorBody: adminErrorBody,
  });
}
