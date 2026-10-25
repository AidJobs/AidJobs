'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  canConfirm,
  confirmationMatches,
  countText,
  crawlRunCountFrom,
  jobCountFrom,
  sourceDangerActions,
  type ImpactCount,
} from '@/lib/admin/danger';
import { adminDateTime } from '@/lib/dates';

const CRAWL_RUN_LIMIT = 100;

type DangerAction = 'delete' | 'permanent';

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
  const [reloadKey, setReloadKey] = useState(0);
  const [danger, setDanger] = useState<DangerAction | null>(null);
  const [impacts, setImpacts] = useState<ImpactCount[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);

  const openDanger = useCallback(async (action: DangerAction) => {
    const sourceId = params.id;
    setDanger(action);
    setTyped('');
    setDangerError(null);
    const read = async (url: string) => {
      try {
        const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
        return { ok: res.ok, body: await res.json().catch(() => null) };
      } catch {
        return { ok: false, body: null };
      }
    };
    if (action === 'delete') {
      setImpacts([{ state: 'loading' }]);
      const jobs = await read(`/api/admin/jobs/search?source_id=${sourceId}&size=1`);
      setImpacts([jobCountFrom(jobs.ok, jobs.body)]);
    } else {
      setImpacts([{ state: 'loading' }, { state: 'loading' }]);
      const [runs, hidden] = await Promise.all([
        read(`/api/admin/crawl/logs?source_id=${sourceId}&limit=${CRAWL_RUN_LIMIT}`),
        read(`/api/admin/jobs/search?source_id=${sourceId}&status=deleted&size=1`),
      ]);
      setImpacts([crawlRunCountFrom(runs.ok, runs.body, CRAWL_RUN_LIMIT), jobCountFrom(hidden.ok, hidden.body)]);
    }
  }, [params.id]);

  const closeDanger = () => {
    if (busy) return;
    setDanger(null);
    setImpacts([]);
    setTyped('');
    setDangerError(null);
  };

  const confirmDanger = async () => {
    const required = source?.org_name || '';
    if (!danger || !source || !canConfirm(impacts, confirmationMatches(typed, required))) return;
    setBusy(true);
    setDangerError(null);
    try {
      const url = danger === 'delete' ? `/api/admin/sources/${source.id}` : `/api/admin/sources/${source.id}/permanent`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.status !== 'ok') {
        throw new Error(body?.error || body?.detail || `HTTP ${res.status}`);
      }
      if (danger === 'permanent') {
        router.push('/admin/sources');
        return;
      }
      setDanger(null);
      setImpacts([]);
      setTyped('');
      setReloadKey((k) => k + 1);
    } catch (e) {
      setDangerError(e instanceof Error ? e.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  };

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
  }, [params.id, router, reloadKey]);

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
    ['Last crawl', adminDateTime(source.last_crawled_at)],
    ['Next crawl', adminDateTime(source.next_run_at)],
    ['Failures', String(source.consecutive_failures ?? 0)],
    ['Health', source.last_crawl_status || '—'],
  ];
  const actions = sourceDangerActions(source.status);
  const requiredName = source.org_name || '';
  const confirmed = confirmationMatches(typed, requiredName);
  const enabled = canConfirm(impacts, confirmed) && !busy;

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
            {log.ran_at ? <span className="ml-2 text-[#86868B]">{adminDateTime(log.ran_at)}</span> : null}
            {log.message ? <span className="mt-1 block text-[#1D1D1F]">{log.message}</span> : null}
          </li>
        ))}
      </ul>

      <section className="mt-12 max-w-3xl rounded-lg border-2 border-red-300 bg-red-50/40 p-5" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-lg font-semibold text-red-800">Danger area</h2>
        <p className="mt-1 text-sm text-red-900">
          These actions change what the public site shows or remove records. Each asks you to type the organisation name exactly.
        </p>
        {!requiredName && (
          <p className="mt-3 text-sm text-red-800">This source has no organisation name, so it cannot be confirmed here.</p>
        )}
        {actions.deleteSource && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#1D1D1F]">
              <div className="font-medium">Delete source</div>
              <div className="text-[#86868B]">Stops crawling it and hides its jobs from the public site. It can be undone.</div>
            </div>
            <button
              onClick={() => openDanger('delete')}
              disabled={!requiredName}
              className="rounded-lg border border-red-400 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Delete source…
            </button>
          </div>
        )}
        {actions.permanentDelete && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#1D1D1F]">
              <div className="font-medium">Permanently delete</div>
              <div className="text-[#86868B]">Removes this source and its crawl history. It cannot be undone.</div>
            </div>
            <button
              onClick={() => openDanger('permanent')}
              disabled={!requiredName}
              className="rounded-lg border border-red-400 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Permanently delete…
            </button>
          </div>
        )}
      </section>

      {danger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="danger-title">
          <div className="w-full max-w-lg rounded-lg border border-red-300 bg-white p-6 shadow-xl">
            <h3 id="danger-title" className="text-lg font-semibold text-red-800">
              {danger === 'delete' ? 'Delete source' : 'Permanently delete source'}: {requiredName}
            </h3>
            <div className="mt-3 space-y-2 text-sm text-[#1D1D1F]">
              {danger === 'delete' ? (
                <>
                  <p>
                    This stops crawling the source and hides <strong>{countText(impacts[0] ?? { state: 'loading' }, 'job')}</strong> from the public site.
                  </p>
                  <p className="text-[#86868B]">To undo: on the Sources page, show Deleted sources and Resume this one, then restore its jobs on the Jobs page.</p>
                </>
              ) : (
                <>
                  <p>
                    This removes the source and <strong>{countText(impacts[0] ?? { state: 'loading' }, 'crawl run')}</strong>.{' '}
                    <strong className="text-red-700">It cannot be undone.</strong>
                  </p>
                  <p className="text-[#86868B]">
                    Its {countText(impacts[1] ?? { state: 'loading' }, 'hidden job')} stay in the database, hidden, without a source.
                  </p>
                </>
              )}
              {impacts.some((i) => i.state === 'error') && (
                <p className="text-red-700">The impact could not be confirmed, so this action is disabled. Close and try again.</p>
              )}
            </div>
            <label className="mt-4 block text-sm text-[#1D1D1F]">
              Type <span className="font-mono font-semibold">{requiredName}</span> to confirm:
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-[#D2D2D7] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>
            {dangerError && <p className="mt-3 text-sm text-red-700">{dangerError}</p>}
            <div className="mt-5 flex gap-3">
              <button
                onClick={closeDanger}
                disabled={busy}
                className="flex-1 rounded-lg bg-[#F5F5F7] px-4 py-2 text-sm font-medium text-[#1D1D1F] hover:bg-[#E5E5E7] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDanger}
                disabled={!enabled}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Working…' : danger === 'delete' ? 'Delete source' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
