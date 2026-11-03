import { NextRequest, NextResponse } from 'next/server';
import { adminErrorBody, proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const orgName = req.nextUrl.searchParams.get('org_name');
  if (!orgName?.trim()) {
    return NextResponse.json(
      adminErrorBody('org_name parameter is required', 'invalid-request', null),
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  return proxyToBackend({
    route: 'POST /api/admin/crawl/delete-jobs-by-org',
    path: `/api/admin/crawl/delete-jobs-by-org?org_name=${encodeURIComponent(orgName)}`,
    method: 'POST',
    session: req,
    errorBody: adminErrorBody,
  });
}
