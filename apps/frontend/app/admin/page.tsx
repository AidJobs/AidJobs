'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle, AlertCircle, Database as DatabaseIcon, Search as SearchIcon, Play, RotateCw } from 'lucide-react';
import { useAdminView } from '@/components/AdminViewContext';

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
  const { currentView } = useAdminView();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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
      const [dbRes, searchRes] = await Promise.all([
        fetch('/api/db/status'),
        fetch('/api/search/status'),
      ]);

      if (!dbRes.ok) {
        const errorText = await dbRes.text();
        console.error('DB status error:', dbRes.status, errorText);
        setDbStatus({ ok: false, error: `HTTP ${dbRes.status}: ${errorText}` });
      } else {
        const dbData = await dbRes.json();
        setDbStatus(dbData);
      }

      if (!searchRes.ok) {
        const errorText = await searchRes.text();
        console.error('Search status error:', searchRes.status, errorText);
        setSearchStatus({ enabled: false, error: `HTTP ${searchRes.status}: ${errorText}` });
      } else {
        const searchData = await searchRes.json();
        setSearchStatus(searchData);
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
      const response = await fetch('/admin/search/init', {
        method: 'POST',
      });
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
      const response = await fetch('/admin/search/reindex', {
        method: 'POST',
      });
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

  // Render different views based on currentView state
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-headline font-semibold text-[#1D1D1F] mb-2">Dashboard</h1>
                <p className="text-body-sm text-[#86868B]">System overview and status</p>
              </div>

              {/* Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Database Status */}
                <div className="bg-white border border-[#D2D2D7] rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <DatabaseIcon className="w-5 h-5 text-[#86868B]" />
                      <h2 className="text-title font-semibold text-[#1D1D1F]">Database</h2>
                    </div>
                    {dbStatus?.ok ? (
                      <CheckCircle className="w-5 h-5 text-[#30D158]" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-[#FF3B30]" />
                    )}
                  </div>
                  {dbStatus?.ok ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-[#86868B]">Jobs</span>
                        <span className="text-3xl font-semibold text-[#1D1D1F]">
                          {dbStatus.row_counts?.jobs || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-[#86868B]">Sources</span>
                        <span className="text-3xl font-semibold text-[#1D1D1F]">
                          {dbStatus.row_counts?.sources || 0}
                        </span>
                      </div>
                      <div className="pt-4 border-t border-[#D2D2D7]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                          <span className="text-caption text-[#86868B]">Connected</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-body-sm text-[#FF3B30]">
                      {dbStatus?.error || 'Database not available'}
                    </div>
                  )}
                </div>

                {/* Search Status */}
                <div className="bg-white border border-[#D2D2D7] rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <SearchIcon className="w-5 h-5 text-[#86868B]" />
                      <h2 className="text-title font-semibold text-[#1D1D1F]">Search</h2>
                    </div>
                    {searchStatus?.enabled ? (
                      <CheckCircle className="w-5 h-5 text-[#30D158]" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-[#FF3B30]" />
                    )}
                  </div>
                  {searchStatus?.enabled ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-[#86868B]">Index</span>
                        <span className="text-body-sm font-mono text-[#1D1D1F]">
                          {searchStatus.index?.name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-[#86868B]">Documents</span>
                        <span className="text-3xl font-semibold text-[#1D1D1F]">
                          {searchStatus.index?.stats.numberOfDocuments || 0}
                        </span>
                      </div>
                      {searchStatus.index?.lastReindexedAt && (
                        <div className="flex justify-between items-center text-caption">
                          <span className="text-[#86868B]">Last reindexed</span>
                          <span className="text-[#1D1D1F]">
                            {new Date(searchStatus.index.lastReindexedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="pt-4 border-t border-[#D2D2D7]">
                        <div className="flex items-center gap-2 mb-4">
                          <div className={`w-2 h-2 rounded-full ${
                            searchStatus.index?.stats.isIndexing ? 'bg-[#FF9500]' : 'bg-[#30D158]'
                          }`}></div>
                          <span className="text-caption text-[#86868B]">
                            {searchStatus.index?.stats.isIndexing ? 'Indexing...' : 'Ready'}
                          </span>
                        </div>
                        <button
                          onClick={handleReindex}
                          disabled={reindexing}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-body-sm font-medium bg-[#0071E3] text-white rounded-lg hover:bg-[#0077ED] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                        >
                          {reindexing ? (
                            <>
                              <RotateCw className="w-4 h-4 animate-spin" />
                              <span>Reindexing...</span>
                            </>
                          ) : (
                            <>
                              <RotateCw className="w-4 h-4" />
                              <span>Reindex Now</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-body-sm text-[#FF3B30]">
                        {searchStatus?.error || 'Search not enabled'}
                      </div>
                      <button
                        onClick={handleInitialize}
                        disabled={initializing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-body-sm font-medium bg-[#30D158] text-white rounded-lg hover:bg-[#34C759] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {initializing ? (
                          <>
                            <RotateCw className="w-4 h-4 animate-spin" />
                            <span>Initializing...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span>Initialize Index</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="bg-white border border-[#D2D2D7] rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-title font-semibold text-[#1D1D1F]">Actions</h2>
                  <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 text-body-sm font-medium text-[#1D1D1F] bg-[#F5F5F7] rounded-lg hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                      Refresh status
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'sources':
        return (
          <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-headline font-semibold text-[#1D1D1F] mb-2">Sources</h1>
              <p className="text-body-sm text-[#86868B] mb-8">Manage job sources</p>
              <div className="bg-white border border-[#D2D2D7] rounded-lg p-8 text-center">
                <p className="text-body text-[#86868B]">Sources management coming soon</p>
              </div>
            </div>
          </div>
        );

      case 'crawl':
        return (
          <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-headline font-semibold text-[#1D1D1F] mb-2">Crawler</h1>
              <p className="text-body-sm text-[#86868B] mb-8">Monitor and manage crawls</p>
              <div className="bg-white border border-[#D2D2D7] rounded-lg p-8 text-center">
                <p className="text-body text-[#86868B]">Crawler management coming soon</p>
              </div>
            </div>
          </div>
        );

      case 'find-earn':
        return (
          <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-headline font-semibold text-[#1D1D1F] mb-2">Find & Earn</h1>
              <p className="text-body-sm text-[#86868B] mb-8">Manage Find & Earn submissions</p>
              <div className="bg-white border border-[#D2D2D7] rounded-lg p-8 text-center">
                <p className="text-body text-[#86868B]">Find & Earn management coming soon</p>
              </div>
            </div>
          </div>
        );

      case 'taxonomy':
        return (
          <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-headline font-semibold text-[#1D1D1F] mb-2">Taxonomy</h1>
              <p className="text-body-sm text-[#86868B] mb-8">Manage taxonomy and normalization</p>
              <div className="bg-white border border-[#D2D2D7] rounded-lg p-8 text-center">
                <p className="text-body text-[#86868B]">Taxonomy management coming soon</p>
              </div>
            </div>
          </div>
        );

      case 'setup':
        return (
          <div className="h-full p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-headline font-semibold text-[#1D1D1F] mb-2">Setup</h1>
              <p className="text-body-sm text-[#86868B] mb-8">System configuration and status</p>
              <div className="bg-white border border-[#D2D2D7] rounded-lg p-8 text-center">
                <p className="text-body text-[#86868B]">Setup management coming soon</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="h-full">
        {renderView()}
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
