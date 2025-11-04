'use client';

import { useState, useEffect } from 'react';

interface Source {
  id: string;
  org_name: string | null;
  careers_url: string;
  source_type: string;
  status: string;
  last_crawled_at: string | null;
  last_crawl_status: string | null;
}

interface CrawlLog {
  id: string;
  source_id: string;
  org_name: string | null;
  careers_url: string;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
  status: string;
  message: string | null;
  ran_at: string;
}

export default function CrawlPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [logs, setLogs] = useState<Record<string, CrawlLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSources();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/admin/sources?page=1&size=100');
      const data = await res.json();
      
      if (data.status === 'ok') {
        const activeSources = data.data.items.filter((s: Source) => s.status !== 'deleted');
        setSources(activeSources);
        
        // Fetch logs for each source
        for (const source of activeSources) {
          fetchLogsForSource(source.id);
        }
      }
    } catch (error) {
      showToast('Error loading sources', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogsForSource = async (sourceId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/admin/crawl/logs?source_id=${sourceId}&limit=5`);
      const data = await res.json();
      
      if (data.status === 'ok') {
        setLogs(prev => ({
          ...prev,
          [sourceId]: data.data
        }));
      }
    } catch (error) {
      console.error(`Failed to fetch logs for source ${sourceId}:`, error);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const runCrawl = async (sourceId: string) => {
    setRunning(prev => ({ ...prev, [sourceId]: true }));
    
    try {
      const res = await fetch('http://localhost:8000/admin/crawl/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      });

      const data = await res.json();

      if (res.ok && data.status === 'ok') {
        const stats = data.data.stats;
        showToast(
          `Crawl completed: ${stats.found} found, ${stats.inserted} inserted, ${stats.updated} updated`,
          'success'
        );
        
        // Refresh logs for this source
        fetchLogsForSource(sourceId);
        
        // Refresh sources to update last_crawled_at
        fetchSources();
      } else {
        showToast(data.data?.message || 'Crawl failed', 'error');
      }
    } catch (error) {
      showToast('Error running crawl', 'error');
    } finally {
      setRunning(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Crawler Management</h1>
          <p className="text-muted-foreground mt-1">
            Run crawlers and view crawl history ({sources.length} sources)
          </p>
        </div>

        {toast && (
          <div className={`mb-4 p-4 rounded-md ${
            toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
            'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {toast.message}
          </div>
        )}

        {loading ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">Loading sources...</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No sources available. Add sources first.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sources.map(source => (
              <div key={source.id} className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-foreground">
                      {source.org_name || 'Unnamed Source'}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {source.careers_url}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span>Type: {source.source_type}</span>
                      <span>Last crawled: {formatDate(source.last_crawled_at)}</span>
                      {source.last_crawl_status && (
                        <span className={`px-2 py-1 rounded-md text-xs border ${getStatusBadgeColor(source.last_crawl_status)}`}>
                          {source.last_crawl_status}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => runCrawl(source.id)}
                    disabled={running[source.id]}
                    className={`px-4 py-2 rounded-md font-medium transition-opacity ${
                      running[source.id]
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:opacity-90'
                    }`}
                  >
                    {running[source.id] ? 'Running...' : 'Run Crawl'}
                  </button>
                </div>

                {/* Crawl logs for this source */}
                {logs[source.id] && logs[source.id].length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold text-foreground mb-2">Recent Crawls</h3>
                    <div className="space-y-2">
                      {logs[source.id].map(log => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between text-sm p-3 bg-background rounded-md"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <span className={`px-2 py-1 rounded-md text-xs border ${getStatusBadgeColor(log.status)}`}>
                              {log.status}
                            </span>
                            <span className="text-muted-foreground">
                              {formatDate(log.ran_at)}
                            </span>
                            <span className="text-foreground">
                              {log.found} found, {log.inserted} inserted, {log.updated} updated
                              {log.skipped > 0 && `, ${log.skipped} skipped`}
                            </span>
                          </div>
                          {log.message && (
                            <span className="text-xs text-muted-foreground ml-4">
                              {log.message}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
