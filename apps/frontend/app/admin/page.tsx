'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle, AlertCircle, Database as DatabaseIcon, Search as SearchIcon, Play, RotateCw, Activity, TrendingUp, Clock, Network } from 'lucide-react';

type DbStatus = {
  ok: boolean;
  row_counts?: {
    jobs: number;
    sources: number;
  };
  error?: string;
};

type SearchStatus = {
  enabled: boolean;
  index?: {
    name: string;
    stats: {
      numberOfDocuments: number;
      isIndexing: boolean;
    };
    lastReindexedAt?: string;
  };
  error?: string;
};

type ReindexResult = {
  indexed: number;
  skipped: number;
  duration_ms: number;
  error?: string;
};

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

export default function AdminPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [crawlerStatus, setCrawlerStatus] = useState<any>(null);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/session', {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (!data.authenticated) {
        router.push('/admin/login');
        return false;
      }
      
      setAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/admin/login');
      return false;
    }
  }, [router]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [dbRes, searchRes, crawlRes] = await Promise.all([
        fetch('/api/db/status'),
        fetch('/api/search/status').catch((err) => {
          console.error('Search status fetch failed:', err);
          return { ok: false, status: 0, text: async () => err.message } as Response;
        }),
        fetch('/api/admin/crawl/status').catch(() => null), // May fail if not authenticated
      ]);

      if (!dbRes.ok) {
        const errorText = await dbRes.text();
        console.error('DB status error:', dbRes.status, errorText);
        setDbStatus({ ok: false, error: `HTTP ${dbRes.status}: ${errorText}` });
      } else {
        try {
          const dbData = await dbRes.json();
          setDbStatus(dbData);
        } catch (err) {
          console.error('Failed to parse DB status:', err);
          setDbStatus({ ok: false, error: 'Invalid response from database status endpoint' });
        }
      }

      // Handle search status response with comprehensive error handling
      try {
        if (!searchRes || !searchRes.ok) {
          const statusCode = searchRes?.status || 0;
          let errorText = 'Unknown error';
          try {
            errorText = await searchRes?.text() || 'No response from server';
          } catch (e) {
            errorText = searchRes instanceof Error ? searchRes.message : 'Network error';
          }
          console.error('Search status error:', statusCode, errorText);
          setSearchStatus({ enabled: false, error: `HTTP ${statusCode}: ${errorText}` });
        } else {
          // Read response as text first to check if it's empty
          let text = '';
          try {
            text = await searchRes.text();
          } catch (readError) {
            console.error('Failed to read search status response:', readError);
            setSearchStatus({ enabled: false, error: 'Failed to read response from search status endpoint' });
            return;
          }
          
          if (!text || text.trim() === '') {
            console.error('Search status returned empty response. Status:', searchRes.status);
            setSearchStatus({ enabled: false, error: 'Empty response from search status endpoint' });
          } else {
            try {
              const searchData = JSON.parse(text);
              setSearchStatus(searchData);
            } catch (parseError) {
              console.error('Failed to parse search status JSON. Status:', searchRes.status);
              console.error('Response content:', text.substring(0, 200));
              console.error('Parse error:', parseError);
              // Provide user-friendly error message
              const errorMsg = parseError instanceof Error && parseError.message.includes('Expecting value') 
                ? 'Empty or invalid response from search status endpoint. Please check backend logs.'
                : `Invalid JSON response: ${parseError instanceof Error ? parseError.message : 'Parse error'}`;
              setSearchStatus({ enabled: false, error: errorMsg });
            }
          }
        }
      } catch (error) {
        console.error('Failed to process search status response:', error);
        const errorMsg = error instanceof Error 
          ? (error.message.includes('Expecting value') 
              ? 'Empty or invalid response from search status endpoint'
              : error.message)
          : 'Failed to fetch search status';
        setSearchStatus({ enabled: false, error: errorMsg });
      }

      if (crawlRes && crawlRes.ok) {
        const crawlData = await crawlRes.json();
        setCrawlerStatus(crawlData.data || crawlData);
      } else if (crawlRes && !crawlRes.ok) {
        // Log but don't fail the entire status fetch if crawler status fails
        console.warn('Crawler status unavailable:', crawlRes.status);
        setCrawlerStatus(null); // Clear stale data
      } else if (crawlRes === null) {
        // Request failed, clear stale data
        setCrawlerStatus(null);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
      addToast('Failed to fetch status', 'error');
      setDbStatus({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
      setSearchStatus({ enabled: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      const response = await fetch('/api/admin/search/init', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      
      const data = await response.json();

      if (data.success) {
        addToast('Search index initialized successfully', 'success');
        await fetchStatus();
      } else {
        addToast(`Initialization failed: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('Initialize error:', error);
      addToast('Initialization request failed', 'error');
    } finally {
      setInitializing(false);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const response = await fetch('/api/admin/search/reindex', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      
      const data: ReindexResult = await response.json();

      if (data.error) {
        addToast(`Reindex failed: ${data.error}`, 'error');
      } else {
        addToast(
          `Reindexed ${data.indexed} jobs in ${data.duration_ms}ms`,
          'success'
        );
        await fetchStatus();
      }
    } catch (error) {
      console.error('Reindex error:', error);
      addToast('Reindex request failed', 'error');
    } finally {
      setReindexing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const isAuth = await checkAuth();
      if (isAuth) {
        await fetchStatus();
      }
    };
    init();
  }, [checkAuth, fetchStatus]);

  if (authenticated === null || loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-[#86868B] text-body">Loading admin panel...</div>
      </div>
    );
  }

  // Calculate system health score (0-100)
  const calculateHealthScore = () => {
    let score = 0;
    let total = 0;
    
    if (dbStatus) {
      total += 1;
      if (dbStatus.ok) score += 1;
    }
    
    if (searchStatus) {
      total += 1;
      if (searchStatus.enabled) score += 1;
    }
    
    if (crawlerStatus) {
      total += 1;
      if (crawlerStatus.running) score += 1;
    }
    
    return total > 0 ? Math.round((score / total) * 100) : 0;
  };

  const healthScore = calculateHealthScore();
  // Soft, elegant colors: mint green (80-100%), soft amber (50-79%), soft coral (0-49%)
  const healthColor = healthScore >= 80 ? '#34D399' : healthScore >= 50 ? '#FCD34D' : '#F87171';

  return (
    <>
      <div className="h-full p-4 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-title font-semibold text-[#1D1D1F] mb-1">Dashboard</h1>
              <p className="text-caption text-[#86868B]">System overview and status</p>
            </div>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
            >
              <RefreshCw className={`w-4 h-4 text-[#86868B] ${loading ? 'animate-spin' : ''}`} />
              <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                Refresh status
              </span>
            </button>
          </div>

          {/* System Health Score - Elegant Circle */}
          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">System Health</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-semibold text-[#1D1D1F]">{healthScore}%</div>
                  <div className="text-caption text-[#86868B]">Overall</div>
                </div>
                <div className="w-12 h-12 rounded-full border-4 border-[#F5F5F7] flex items-center justify-center relative" style={{
                  borderTopColor: healthColor,
                  borderRightColor: healthColor,
                  transform: `rotate(${(healthScore / 100) * 360 - 90}deg)`,
                  transition: 'transform 0.3s ease-apple'
                }}>
                  <div className="w-8 h-8 rounded-full bg-white"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats and Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Quick Stats */}
            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Quick Stats</h2>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-caption text-[#86868B]">Total Jobs</span>
                  <span className="text-body font-semibold text-[#1D1D1F]">
                    {dbStatus?.row_counts?.jobs || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-caption text-[#86868B]">Active Sources</span>
                  <span className="text-body font-semibold text-[#1D1D1F]">
                    {dbStatus?.row_counts?.sources || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-caption text-[#86868B]">Indexed Documents</span>
                  <span className="text-body font-semibold text-[#1D1D1F]">
                    {searchStatus?.index?.stats.numberOfDocuments || 0}
                  </span>
                </div>
                {searchStatus?.index?.lastReindexedAt && (
                  <div className="pt-2 border-t border-[#D2D2D7]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#86868B]" />
                      <span className="text-caption text-[#86868B]">
                        Last reindex: {new Date(searchStatus.index.lastReindexedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Recent Activity</h2>
              </div>
              <div className="space-y-2">
                {searchStatus?.index?.lastReindexedAt ? (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-[#86868B] rounded-full"></div>
                    <div className="flex-1">
                      <div className="text-caption text-[#1D1D1F]">Search index reindexed</div>
                      <div className="text-caption text-[#86868B]">
                        {new Date(searchStatus.index.lastReindexedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-caption text-[#86868B]">No recent activity</div>
                )}
                {dbStatus?.ok && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                    <div className="flex-1">
                      <div className="text-caption text-[#1D1D1F]">Database connected</div>
                      <div className="text-caption text-[#86868B]">System operational</div>
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>

          {/* Status Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Database Status */}
            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="w-4 h-4 text-[#86868B]" />
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Database</h2>
                </div>
                {dbStatus?.ok ? (
                  <div className="w-2 h-2 bg-[#30D158] rounded-full relative group" title="Connected">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Connected
                    </span>
                  </div>
                ) : (
                  <div className="relative group">
                    <AlertCircle className="w-4 h-4 text-[#FF3B30]" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Disconnected
                    </span>
                  </div>
                )}
              </div>
              {dbStatus?.ok ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-caption text-[#86868B]">Jobs</span>
                    <span className="text-2xl font-semibold text-[#1D1D1F]">
                      {dbStatus.row_counts?.jobs || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-caption text-[#86868B]">Sources</span>
                    <span className="text-2xl font-semibold text-[#1D1D1F]">
                      {dbStatus.row_counts?.sources || 0}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-caption text-[#FF3B30]">
                  {dbStatus?.error || 'Database not available'}
                </div>
              )}
            </div>

            {/* Search Status */}
            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SearchIcon className="w-4 h-4 text-[#86868B]" />
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Search</h2>
                </div>
                {searchStatus?.enabled ? (
                  <div className="w-2 h-2 bg-[#30D158] rounded-full relative group" title="Enabled">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Enabled
                    </span>
                  </div>
                ) : (
                  <div className="relative group">
                    <AlertCircle className="w-4 h-4 text-[#FF3B30]" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Disabled
                    </span>
                  </div>
                )}
              </div>
              {searchStatus?.enabled || searchStatus?.index ? (
                <div className="space-y-2">
                  {searchStatus.index && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-caption text-[#86868B]">Index</span>
                        <span className="text-caption font-mono text-[#1D1D1F]">
                          {searchStatus.index.name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-caption text-[#86868B]">Documents</span>
                        <span className="text-2xl font-semibold text-[#1D1D1F]">
                          {searchStatus.index.stats?.numberOfDocuments || 0}
                        </span>
                      </div>
                      {searchStatus.index.stats?.isIndexing && (
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#FF9500] animate-pulse"></div>
                          <span className="text-caption text-[#FF9500]">Indexing...</span>
                        </div>
                      )}
                      {searchStatus.index.lastReindexedAt && (
                        <div className="flex justify-between items-center text-caption">
                          <span className="text-[#86868B]">Last reindexed</span>
                          <span className="text-[#1D1D1F]">
                            {new Date(searchStatus.index.lastReindexedAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {!searchStatus?.enabled && searchStatus?.error && (
                    <div className="text-caption text-[#FF9500] bg-[#FFF4E6] border border-[#FF9500] rounded px-2 py-1">
                      {searchStatus.error}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleReindex}
                      disabled={reindexing}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                    >
                      <RotateCw className={`w-4 h-4 text-[#86868B] ${reindexing ? 'animate-spin' : ''}`} />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                        {reindexing ? 'Reindexing...' : 'Reindex Now'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-caption text-[#FF3B30]">
                    {searchStatus?.error 
                      ? (searchStatus.error.includes('Expecting value') 
                          ? 'Empty or invalid response from search endpoint. Check console for details.'
                          : searchStatus.error)
                      : 'Search not enabled'}
                  </div>
                  <button
                    onClick={handleInitialize}
                    disabled={initializing}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                  >
                    {initializing ? (
                      <RotateCw className="w-4 h-4 text-[#86868B] animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 text-[#86868B]" />
                    )}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      {initializing ? 'Initializing...' : 'Initialize Index'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Crawler Status */}
            <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-[#86868B]" />
                  <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Crawler</h2>
                </div>
                {crawlerStatus?.running ? (
                  <div className="w-2 h-2 bg-[#30D158] rounded-full relative group">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Running
                    </span>
                  </div>
                ) : (
                  <div className="w-2 h-2 bg-[#D2D2D7] rounded-full relative group">
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Stopped
                    </span>
                  </div>
                )}
              </div>
              {crawlerStatus ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-caption text-[#86868B]">Active</span>
                    <span className="text-2xl font-semibold text-[#1D1D1F]">
                      {crawlerStatus.in_flight || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-caption text-[#86868B]">Queued</span>
                    <span className="text-2xl font-semibold text-[#1D1D1F]">
                      {crawlerStatus.due_count || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-caption text-[#86868B]">Locked</span>
                    <span className="text-2xl font-semibold text-[#1D1D1F]">
                      {crawlerStatus.locked || 0}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-caption text-[#86868B]">
                  Crawler status unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-body-sm max-w-sm animate-slide-in ${
              toast.type === 'success' ? 'bg-[#30D158]' : 'bg-[#FF3B30]'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
