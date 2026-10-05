'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type SourceDetail = {
  id: string;
  org_name: string | null;
  careers_url: string;
  source_type: string;
  org_type: string | null;
  status: string;
  crawl_frequency_days: number | null;
  next_run_at: string | null;
  last_crawled_at: string | null;
  last_crawl_status: string | null;
  last_crawl_message: string | null;
  consecutive_failures: number | null;
};

type CrawlLog = {
  id: string;
  status: string;
  ran_at?: string;
  message?: string | null;
  found?: number;
  inserted?: number;
  updated?: number;
};

export default function SourceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sourceId = params.id;
    if (!sourceId) {
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/sources/${sourceId}`, { credentials: 'include' }),
      fetch(`/api/admin/crawl/logs?source_id=${sourceId}&limit=10`, { credentials: 'include' }),
    ])
      .then(async ([sourceResponse, logsResponse]) => {
        if (sourceResponse.status === 401 || logsResponse.status === 401) {
          router.push('/admin/login');
          return;
        }
        const sourceBody = await sourceResponse.json();
        const logsBody = await logsResponse.json().catch(() => ({ data: [] }));
        if (!cancelled) {
          if (!sourceResponse.ok) {
            setError(sourceBody.detail || sourceBody.error || 'Source could not be loaded');
            return;
          }
          setSource(sourceBody.data);
          setLogs(Array.isArray(logsBody.data) ? logsBody.data : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Source could not be loaded');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return <p className="p-8 text-sm text-red-700">{error}</p>;
  }
  if (!source) {
    return <p className="p-8 text-sm text-[#86868B]">Loading source</p>;
  }

  const fields = [
    ['Organisation', source.org_name || 'Unnamed'],
    ['URL', source.careers_url],
    ['Type', source.source_type],
    ['Organisation type', source.org_type || '—'],
    ['Status', source.status],
    ['Schedule', source.crawl_frequency_days ? `Every ${source.crawl_frequency_days} days` : '—'],
    ['Last crawl', source.last_crawled_at || '—'],
    ['Next crawl', source.next_run_at || '—'],
    ['Failures', String(source.consecutive_failures ?? 0)],
    ['Health', source.last_crawl_status || '—'],
  ];

  return (
    <div className="h-full overflow-y-auto p-8">
      <Link href="/admin/sources" className="text-sm text-[#0071E3]">
        Back to sources
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-[#1D1D1F]">
        {source.org_name || 'Source'}
      </h1>
      <dl className="mt-6 grid gap-3 max-w-3xl">
        {fields.map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-3 text-sm">
            <dt className="text-[#86868B]">{label}</dt>
            <dd className="col-span-2 break-all text-[#1D1D1F]">{value}</dd>
          </div>
        ))}
      </dl>
      {source.last_crawl_message && (
        <p className="mt-4 max-w-3xl text-sm text-[#1D1D1F]">{source.last_crawl_message}</p>
      )}
      <h2 className="mt-8 text-lg font-semibold text-[#1D1D1F]">Recent crawl runs</h2>
      <ul className="mt-3 max-w-3xl divide-y divide-[#D2D2D7]">
        {logs.length === 0 && <li className="py-3 text-sm text-[#86868B]">No crawl runs yet</li>}
        {logs.map((log) => (
          <li key={log.id} className="py-3 text-sm">
            <span className="font-medium">{log.status}</span>
            {log.ran_at ? <span className="ml-2 text-[#86868B]">{log.ran_at}</span> : null}
            {log.message ? <span className="mt-1 block text-[#1D1D1F]">{log.message}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
