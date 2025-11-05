'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Source = {
  id: string;
  org_name: string | null;
  careers_url: string;
  status: string;
  next_run_at: string | null;
  last_crawled_at: string | null;
  last_crawl_status: string | null;
};

type CrawlLog = {
  id: string;
  source_id: string;
  org_name: string;
  careers_url: string;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
  duration_ms: number | null;
  status: string;
  message: string | null;
  ran_at: string;
};

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

type DomainPolicy = {
  host: string;
  max_concurrency: number;
  min_request_interval_ms: number;
  max_pages: number;
  max_kb_per_page: number;
  allow_js: boolean;
};

export default function AdminCrawlPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const [policyHost, setPolicyHost] = useState('');
  const [policy, setPolicy] = useState<DomainPolicy>({
    host: '',
    max_concurrency: 1,
    min_request_interval_ms: 3000,
    max_pages: 10,
    max_kb_per_page: 1024,
    allow_js: false,
  });

  useEffect(() => {
    fetchSources();
    fetchCrawlStatus();
    fetchLogs();
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (selectedSourceId) {
      fetchLogs(selectedSourceId);
    } else {
      fetchLogs();
    }
  }, [selectedSourceId]);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        size: '100',
        status: statusFilter,
      });
      
      if (searchQuery) {
        params.append('query', searchQuery);
      }

      const res = await fetch(`/api/admin/sources?${params}`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch sources');
      }

      const json = await res.json();
      setSources(json.data.items);
    } catch (error) {
      console.error('Failed to fetch sources:', error);
      toast.error('Failed to fetch sources');
    } finally {
      setLoading(false);
    }
  };

  const fetchCrawlStatus = async () => {
    try {
      const res = await fetch('/api/admin/crawl/status', {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch crawl status');
      }

      const json = await res.json();
      setCrawlStatus(json.data);
    } catch (error) {
      console.error('Failed to fetch crawl status:', error);
    }
  };

  const fetchLogs = async (sourceId?: string) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (sourceId) {
        params.append('source_id', sourceId);
      }

      const res = await fetch(`/api/admin/crawl/logs?${params}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }

      const json = await res.json();
      setLogs(json.data);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to fetch logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRunSource = async (sourceId: string) => {
    try {
      const res = await fetch('/api/admin/crawl/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ source_id: sourceId }),
      });

      if (!res.ok) {
        throw new Error('Failed to run crawl');
      }

      const json = await res.json();
      toast.success(json.message || 'Crawl queued');
      
      setTimeout(() => {
        fetchCrawlStatus();
        fetchLogs(selectedSourceId || undefined);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to run crawl:', error);
      toast.error(error.message || 'Failed to run crawl');
    }
  };

  const handleRunDue = async () => {
    try {
      const res = await fetch('/api/admin/crawl/run_due', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to run due crawls');
      }

      const json = await res.json();
      toast.success(`Queued ${json.data.queued || 0} crawls`);
      
      setTimeout(() => {
        fetchCrawlStatus();
        fetchLogs(selectedSourceId || undefined);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to run due crawls:', error);
      toast.error(error.message || 'Failed to run due crawls');
    }
  };

  const handleRefreshStatus = () => {
    fetchCrawlStatus();
    fetchSources();
    fetchLogs(selectedSourceId || undefined);
    toast.success('Status refreshed');
  };

  const handleOpenPolicyEditor = async (sourceUrl: string) => {
    try {
      const url = new URL(sourceUrl);
      const host = url.hostname;
      setPolicyHost(host);
      
      const res = await fetch(`/api/admin/domain_policies/${host}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch policy');
      }

      const json = await res.json();
      setPolicy(json.data);
      setShowPolicyEditor(true);
    } catch (error: any) {
      console.error('Failed to fetch policy:', error);
      toast.error(error.message || 'Failed to fetch policy');
    }
  };

  const handleSavePolicy = async () => {
    try {
      const res = await fetch(`/api/admin/domain_policies/${policyHost}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          max_concurrency: policy.max_concurrency,
          min_request_interval_ms: policy.min_request_interval_ms,
          max_pages: policy.max_pages,
          max_kb_per_page: policy.max_kb_per_page,
          allow_js: policy.allow_js,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save policy');
      }

      toast.success('Policy saved');
      setShowPolicyEditor(false);
    } catch (error: any) {
      console.error('Failed to save policy:', error);
      toast.error(error.message || 'Failed to save policy');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const selectedSource = sources.find(s => s.id === selectedSourceId);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Crawler Status</h1>
              <p className="text-sm text-muted mt-1">Monitor and manage web crawler</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRunDue}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Run Due Sources
              </button>
              <button
                onClick={handleRefreshStatus}
                className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                Refresh Status
              </button>
            </div>
          </div>

          {crawlStatus && (
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div className="bg-background border border-border rounded-lg p-3">
                <div className="text-muted mb-1">Status</div>
                <div className="text-lg font-semibold text-foreground">
                  {crawlStatus.running ? (
                    <span className="text-green-600">Running</span>
                  ) : (
                    <span className="text-gray-600">Stopped</span>
                  )}
                </div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3">
                <div className="text-muted mb-1">Due Now</div>
                <div className="text-lg font-semibold text-foreground">{crawlStatus.due_count}</div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3">
                <div className="text-muted mb-1">In Flight</div>
                <div className="text-lg font-semibold text-foreground">{crawlStatus.in_flight}</div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3">
                <div className="text-muted mb-1">Available Slots</div>
                <div className="text-lg font-semibold text-foreground">{crawlStatus.pool.available}/{crawlStatus.pool.global_max}</div>
              </div>
              <div className="bg-background border border-border rounded-lg p-3">
                <div className="text-muted mb-1">Locked</div>
                <div className="text-lg font-semibold text-foreground">{crawlStatus.locked}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1">
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">Sources</h2>
              
              <div className="mb-4 space-y-2">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="all">All</option>
                </select>
              </div>

              {loading ? (
                <div className="text-center text-muted py-8">Loading...</div>
              ) : sources.length === 0 ? (
                <div className="text-center text-muted py-8">No sources found</div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      onClick={() => setSelectedSourceId(source.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedSourceId === source.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      <div className="font-medium text-foreground mb-1">
                        {source.org_name || 'Unnamed'}
                      </div>
                      <div className="text-xs text-muted mb-2 truncate">
                        {source.careers_url}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-0.5 rounded ${
                          source.status === 'active' ? 'bg-green-100 text-green-700' :
                          source.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {source.status}
                        </span>
                        {source.last_crawl_status && (
                          <span className={`px-2 py-0.5 rounded ${
                            source.last_crawl_status === 'success' ? 'bg-green-100 text-green-700' :
                            source.last_crawl_status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {source.last_crawl_status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-2">
                        Next: {formatDate(source.next_run_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-2 space-y-6">
            {selectedSource && (
              <div className="bg-surface border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {selectedSource.org_name || 'Unnamed'}
                    </h2>
                    <p className="text-sm text-muted">{selectedSource.careers_url}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRunSource(selectedSource.id)}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                    >
                      Run Now
                    </button>
                    <button
                      onClick={() => handleOpenPolicyEditor(selectedSource.careers_url)}
                      className="px-3 py-1.5 bg-surface border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
                    >
                      Domain Policy
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Crawl Logs {selectedSource && `(${selectedSource.org_name || 'Unnamed'})`}
              </h2>

              {logsLoading ? (
                <div className="text-center text-muted py-8">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="text-center text-muted py-8">No logs found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-2 text-muted font-medium">Time</th>
                        <th className="pb-2 text-muted font-medium">Org</th>
                        <th className="pb-2 text-muted font-medium text-right">Found</th>
                        <th className="pb-2 text-muted font-medium text-right">Inserted</th>
                        <th className="pb-2 text-muted font-medium text-right">Updated</th>
                        <th className="pb-2 text-muted font-medium text-right">Skipped</th>
                        <th className="pb-2 text-muted font-medium text-right">Duration</th>
                        <th className="pb-2 text-muted font-medium">Status</th>
                        <th className="pb-2 text-muted font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-border">
                          <td className="py-2 text-foreground">{formatDate(log.ran_at)}</td>
                          <td className="py-2 text-foreground">{log.org_name || 'Unnamed'}</td>
                          <td className="py-2 text-foreground text-right">{log.found}</td>
                          <td className="py-2 text-foreground text-right">{log.inserted}</td>
                          <td className="py-2 text-foreground text-right">{log.updated}</td>
                          <td className="py-2 text-foreground text-right">{log.skipped}</td>
                          <td className="py-2 text-foreground text-right">{formatDuration(log.duration_ms)}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              log.status === 'success' ? 'bg-green-100 text-green-700' :
                              log.status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2 text-muted text-xs max-w-xs truncate">
                            {log.message || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPolicyEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Domain Policy: {policyHost}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Max Concurrency
                </label>
                <input
                  type="number"
                  value={policy.max_concurrency}
                  onChange={(e) => setPolicy({ ...policy, max_concurrency: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  min="1"
                  max="10"
                />
                <p className="text-xs text-muted mt-1">Simultaneous requests to this domain</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Min Request Interval (ms)
                </label>
                <input
                  type="number"
                  value={policy.min_request_interval_ms}
                  onChange={(e) => setPolicy({ ...policy, min_request_interval_ms: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  min="100"
                  max="60000"
                  step="100"
                />
                <p className="text-xs text-muted mt-1">Delay between requests to this domain</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Max Pages
                </label>
                <input
                  type="number"
                  value={policy.max_pages}
                  onChange={(e) => setPolicy({ ...policy, max_pages: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  min="1"
                  max="100"
                />
                <p className="text-xs text-muted mt-1">Maximum pages to crawl per session</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Max KB per Page
                </label>
                <input
                  type="number"
                  value={policy.max_kb_per_page}
                  onChange={(e) => setPolicy({ ...policy, max_kb_per_page: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  min="100"
                  max="10240"
                  step="100"
                />
                <p className="text-xs text-muted mt-1">Maximum page size to download</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="allow_js"
                  checked={policy.allow_js}
                  onChange={(e) => setPolicy({ ...policy, allow_js: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="allow_js" className="text-sm font-medium text-foreground">
                  Allow JavaScript
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSavePolicy}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Save Policy
              </button>
              <button
                onClick={() => setShowPolicyEditor(false)}
                className="flex-1 px-4 py-2 bg-surface border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
