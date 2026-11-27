'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminDateTime, relativeTime } from '@/lib/dates';
import { RefreshCw, Play, Activity, Clock, CheckCircle, XCircle, AlertCircle, TrendingUp, Zap, FileSearch } from 'lucide-react';
import CrawlReviewModal from '@/components/admin/CrawlReviewModal';
import {
  completenessBadge,
  foundVsExpectedLabel,
  type CrawlLogLifecycle,
} from '@/lib/admin/crawlReview';

type CrawlStatus = {
  running: boolean;
  pool: {
    global_max: number;
    available: number;
  };
  due_count: number;
  locked: number;
  in_flight: number;
};

type CrawlLog = CrawlLogLifecycle;

export default function AdminCrawlPage() {
  const router = useRouter();
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [runningDue, setRunningDue] = useState(false);
  const [reviewLogId, setReviewLogId] = useState<string | null>(null);

  const fetchCrawlStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/crawl/status', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        let errorData;
        try {
          errorData = await res.json();
        } catch {
          errorData = { error: `HTTP ${res.status}: Failed to fetch crawl status` };
        }
        console.error('Crawl status error:', res.status, errorData);
        const errorMsg = errorData.error || errorData.detail || `HTTP ${res.status}: Failed to fetch crawl status`;
        toast.error(errorMsg);
        setCrawlStatus(null);
        return;
      }

      const json = await res.json();
      
      // Handle different response formats
      if (json.status === 'ok' && json.data) {
        setCrawlStatus(json.data);
      } else if (json.status === 'error') {
        // Backend returned an error
        console.error('Crawl status error:', json.error);
        toast.error(json.error || 'Failed to fetch crawl status');
        setCrawlStatus(null);
      } else if (json.data) {
        // Some backends return data directly
        setCrawlStatus(json.data);
      } else {
        // Unexpected format - log but don't show error to user
        console.warn('Unexpected crawl status response format:', json);
        setCrawlStatus(null);
      }
    } catch (error) {
      console.error('Failed to fetch crawl status:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch crawl status';
      toast.error(errorMsg);
      setCrawlStatus(null);
    }
  }, [router]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/crawl/logs?limit=15', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to fetch logs');
      }

      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        setLogs(json.data);
      } else {
        setLogs([]);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to fetch logs');
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [router]);

  const handleRunDue = async () => {
    setRunningDue(true);
    try {
      const res = await fetch('/api/admin/crawl/run_due', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to run due crawls');
      }

      const json = await res.json();
      const queued = json.data?.queued || 0;
      toast.success(`Queued ${queued} crawl${queued !== 1 ? 's' : ''}`);
      
      // Refresh status and logs after a short delay
      setTimeout(() => {
        fetchCrawlStatus();
        fetchLogs();
      }, 1000);
    } catch (error) {
      console.error('Failed to run due crawls:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to run due crawls';
      toast.error(errorMsg);
    } finally {
      setRunningDue(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchCrawlStatus(), fetchLogs()]);
    setLoading(false);
    toast.success('Status refreshed');
  };

  // Initial fetch only - no auto-refresh to save API quota on free tiers
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchCrawlStatus(), fetchLogs()]);
      setLoading(false);
    };
    init();
  }, [fetchCrawlStatus, fetchLogs]);

  const formatDate = (dateStr: string) => relativeTime(dateStr, Date.now()) ?? adminDateTime(dateStr);

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold text-[#1D1D1F] mb-1">Crawler</h1>
            <p className="text-caption text-[#86868B]">Monitor crawl activity and status</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDue}
              disabled={runningDue}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
            >
              {runningDue ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4 text-white" />
              )}
              <span className="absolute right-0 top-full mt-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                Run due sources
              </span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
            >
              <RefreshCw className={`w-4 h-4 text-[#86868B] ${loading ? 'animate-spin' : ''}`} />
              <span className="absolute right-0 top-full mt-1.5 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 shadow-lg">
                Refresh status
              </span>
            </button>
          </div>
        </div>

        {/* Status Overview */}
        {crawlStatus && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#86868B]" />
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Status</h2>
                </div>
                {crawlStatus.running ? (
                  <div className="w-2 h-2 bg-[#30D158] rounded-full relative group">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Running
                    </span>
                  </div>
                ) : (
                  <div className="w-2 h-2 bg-[#86868B] rounded-full relative group">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Stopped
                    </span>
                  </div>
                )}
              </div>
              <div className="text-2xl font-semibold text-[#1D1D1F]">
                {crawlStatus.running ? 'Running' : 'Stopped'}
              </div>
            </div>

            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Queued</h2>
              </div>
              <div className="text-2xl font-semibold text-[#1D1D1F]">
                {crawlStatus.due_count || 0}
              </div>
              <div className="text-caption text-[#86868B] mt-1">Sources due for crawl</div>
            </div>

            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Active</h2>
              </div>
              <div className="text-2xl font-semibold text-[#1D1D1F]">
                {crawlStatus.in_flight || 0}
              </div>
              <div className="text-caption text-[#86868B] mt-1">Crawls in progress</div>
            </div>

            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Available</h2>
              </div>
              <div className="text-2xl font-semibold text-[#1D1D1F]">
                {crawlStatus.pool.available}/{crawlStatus.pool.global_max}
              </div>
              <div className="text-caption text-[#86868B] mt-1">Concurrent slots</div>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-[#86868B]" />
            <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Recent Activity</h2>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-caption text-[#86868B]">No crawl activity yet</div>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-[#F5F5F7] rounded-lg p-3 border border-[#D2D2D7] hover:bg-[#E5E5E7] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {log.status === 'ok' || log.status === 'success' ? (
                          <div className="w-2 h-2 bg-[#30D158] rounded-full flex-shrink-0"></div>
                        ) : log.status === 'fail' || log.status === 'error' ? (
                          <div className="w-2 h-2 bg-[#FF3B30] rounded-full flex-shrink-0"></div>
                        ) : (
                          <div className="w-2 h-2 bg-[#FF9500] rounded-full flex-shrink-0"></div>
                        )}
                        <span className="text-body-sm font-semibold text-[#1D1D1F] truncate">
                          {log.org_name || 'Unnamed'}
                        </span>
                        <span className="text-caption text-[#86868B] flex-shrink-0" title={adminDateTime(log.ran_at)}>
                          {formatDate(log.ran_at)}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 mt-2">
                        {log.actual_job_count !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-caption-sm text-[#86868B]">Jobs (not deleted):</span>
                            <span className="text-body-sm font-semibold text-[#30D158]">{log.actual_job_count}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-caption-sm text-[#86868B]">Found:</span>
                          <span className="text-body-sm font-semibold text-[#1D1D1F]">
                            {foundVsExpectedLabel(log.found, log.listing_expected)}
                          </span>
                        </div>
                        {(() => {
                          const badge = completenessBadge(log.listing_complete);
                          const cls =
                            badge.tone === 'ok'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : badge.tone === 'warn'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : 'bg-white text-[#86868B] border-[#D2D2D7]';
                          return (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${cls}`}>
                              {badge.text}
                            </span>
                          );
                        })()}
                        {log.inserted > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-caption-sm text-[#86868B]">+</span>
                            <span className="text-body-sm font-semibold text-[#30D158]">{log.inserted}</span>
                          </div>
                        )}
                        {log.updated > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-caption-sm text-[#86868B]">~</span>
                            <span className="text-body-sm font-semibold text-[#0071E3]">{log.updated}</span>
                          </div>
                        )}
                        {log.expired !== null && log.expired !== undefined && log.expired > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-caption-sm text-[#86868B]">Expired:</span>
                            <span className="text-body-sm font-semibold text-[#86868B]">{log.expired}</span>
                          </div>
                        )}
                        {log.counted !== null && log.counted !== undefined && (
                          <span className="text-caption-sm text-[#86868B]">
                            {log.counted ? 'Counted' : 'Not counted'}
                          </span>
                        )}
                        <div className="flex items-center gap-3 ml-auto">
                          {log.duration_ms !== null && log.duration_ms !== undefined && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-[#86868B]" />
                              <span className="text-caption-sm text-[#86868B]">{formatDuration(log.duration_ms)}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setReviewLogId(log.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-[#D2D2D7] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
                          >
                            <FileSearch className="w-3.5 h-3.5 text-[#0071E3]" />
                            Review
                          </button>
                        </div>
                      </div>

                      {log.message && (
                        <div className="mt-2 pt-2 border-t border-[#D2D2D7]">
                          <p className="text-caption-sm text-[#86868B] line-clamp-2">{log.message}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CrawlReviewModal logId={reviewLogId} onClose={() => setReviewLogId(null)} />
    </div>
  );
}
