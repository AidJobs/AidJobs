'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const checkAuth = async () => {
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
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout failed:', error);
      addToast('Logout failed', 'error');
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [dbRes, searchRes] = await Promise.all([
        fetch('/admin/db/status'),
        fetch('/admin/search/status'),
      ]);

      const dbData = await dbRes.json();
      const searchData = await searchRes.json();

      setDbStatus(dbData);
      setSearchStatus(searchData);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      addToast('Failed to fetch status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const response = await fetch('/admin/search/reindex');
      const data: ReindexResult = await response.json();

      if (data.error) {
        addToast(`Reindex failed: ${data.error}`, 'error');
      } else {
        addToast(
          `Reindexed ${data.indexed} jobs in ${data.duration_ms}ms`,
          'success'
        );
        fetchStatus();
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
  }, []);

  if (authenticated === null || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Panel</h1>
            <p className="text-sm text-gray-500">Development environment only</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Logout
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link
              href="/admin/sources"
              className="px-4 py-3 text-center text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              Sources
            </Link>
            <Link
              href="/admin/crawl"
              className="px-4 py-3 text-center text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              Crawl
            </Link>
            <Link
              href="/admin/find-earn"
              className="px-4 py-3 text-center text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              Find & Earn
            </Link>
            <Link
              href="/admin/setup"
              className="px-4 py-3 text-center text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              Setup
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Database Status</h2>
            {dbStatus?.ok ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Jobs</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {dbStatus.row_counts?.jobs || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Sources</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {dbStatus.row_counts?.sources || 0}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-gray-500">Connected</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-600">
                {dbStatus?.error || 'Database not available'}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Status</h2>
            {searchStatus?.enabled ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Index</span>
                  <span className="text-sm font-mono text-gray-900">
                    {searchStatus.index?.name || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Documents</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {searchStatus.index?.stats.numberOfDocuments || 0}
                  </span>
                </div>
                {searchStatus.index?.lastReindexedAt && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Last reindexed</span>
                    <span className="text-gray-700">
                      {new Date(searchStatus.index.lastReindexedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      searchStatus.index?.stats.isIndexing ? 'bg-yellow-500' : 'bg-green-500'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {searchStatus.index?.stats.isIndexing ? 'Indexing...' : 'Ready'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-600">
                {searchStatus?.error || 'Search not enabled'}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="flex gap-4">
            <button
              onClick={handleReindex}
              disabled={reindexing || !searchStatus?.enabled}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              {reindexing ? 'Reindexing...' : 'Reindex Search'}
            </button>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Refresh Status
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm animate-slide-in ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
