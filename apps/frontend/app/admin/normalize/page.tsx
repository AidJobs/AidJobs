'use client';

import { useEffect, useState, useCallback } from 'react';

type NormalizationReport = {
  ok: boolean;
  totals?: {
    jobs: number;
    sources: number;
  };
  country?: {
    normalized: number;
    unknown: number;
    top_unknown: Array<{ value: string; count: number }>;
  };
  level_norm?: {
    normalized: number;
    unknown: number;
    top_unknown: Array<{ value: string; count: number }>;
  };
  international_eligible?: {
    true_count: number;
    false_count: number;
    null_count: number;
  };
  mission_tags?: {
    normalized: number;
    unknown: number;
    top_unknown: Array<{ value: string; count: number }>;
  };
  mapping_tables?: {
    countries: number;
    levels: number;
    tags: number;
  };
  notes?: {
    fallback_used: boolean;
  };
  error?: string;
};

type PreviewItem = {
  job_id: string;
  raw: {
    org_name?: string;
    title?: string;
    country?: string;
    level_norm?: string;
    mission_tags?: string[];
    international_eligible?: boolean;
  };
  normalized: {
    country_iso?: string;
    level_norm?: string;
    mission_tags?: string[];
    international_eligible?: boolean;
  };
  dropped_fields: string[];
};

type PreviewResponse = {
  total: number;
  previews: PreviewItem[];
};

type ReindexResponse = {
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

export default function AdminNormalizePage() {
  const [report, setReport] = useState<NormalizationReport | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/admin/normalize/report');
      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error('Failed to fetch report:', error);
      addToast('Failed to fetch report', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const response = await fetch('/admin/normalize/preview?limit=10');
      const data = await response.json();
      setPreview(data);
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      addToast('Failed to fetch preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleNormalizeReindex = async () => {
    setReindexing(true);
    try {
      const response = await fetch('/admin/normalize/reindex', { method: 'POST' });
      const data: ReindexResponse = await response.json();
      
      if (data.error) {
        addToast(`Reindex failed: ${data.error}`, 'error');
      } else {
        addToast(
          `Reindexed ${data.indexed} jobs (${data.skipped} skipped) in ${data.duration_ms}ms`,
          'success'
        );
        fetchReport();
      }
    } catch (error) {
      console.error('Reindex error:', error);
      addToast('Reindex request failed', 'error');
    } finally {
      setReindexing(false);
    }
  };

  const handleReindexOnly = async () => {
    setReindexing(true);
    try {
      const response = await fetch('/admin/search/reindex');
      const data: ReindexResponse = await response.json();
      
      if (data.error) {
        addToast(`Reindex failed: ${data.error}`, 'error');
      } else {
        addToast(
          `Reindexed ${data.indexed} jobs in ${data.duration_ms}ms`,
          'success'
        );
      }
    } catch (error) {
      console.error('Reindex error:', error);
      addToast('Reindex request failed', 'error');
    } finally {
      setReindexing(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading normalization report...</div>
      </div>
    );
  }

  if (!report?.ok) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {report?.error || 'Failed to load report'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Normalization Report</h1>
          <p className="text-sm text-gray-500">Development environment only</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Totals</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Jobs</span>
                <span className="text-xl font-bold text-blue-600">{report.totals?.jobs || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Sources</span>
                <span className="text-xl font-bold text-blue-600">{report.totals?.sources || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Country</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Normalized</span>
                <span className="text-lg font-semibold text-green-600">{report.country?.normalized || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Unknown</span>
                <span className="text-lg font-semibold text-orange-600">{report.country?.unknown || 0}</span>
              </div>
              {report.country?.top_unknown && report.country.top_unknown.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">Top Unknown:</p>
                  {report.country.top_unknown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{item.value}</span>
                      <span className="text-gray-500">×{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Level</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Normalized</span>
                <span className="text-lg font-semibold text-green-600">{report.level_norm?.normalized || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Unknown</span>
                <span className="text-lg font-semibold text-orange-600">{report.level_norm?.unknown || 0}</span>
              </div>
              {report.level_norm?.top_unknown && report.level_norm.top_unknown.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">Top Unknown:</p>
                  {report.level_norm.top_unknown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{item.value}</span>
                      <span className="text-gray-500">×{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">International Eligible</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">True</span>
                <span className="text-lg font-semibold text-blue-600">{report.international_eligible?.true_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">False</span>
                <span className="text-lg font-semibold text-blue-600">{report.international_eligible?.false_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Null</span>
                <span className="text-lg font-semibold text-gray-400">{report.international_eligible?.null_count || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Mission Tags</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Normalized</span>
                <span className="text-lg font-semibold text-green-600">{report.mission_tags?.normalized || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Unknown</span>
                <span className="text-lg font-semibold text-orange-600">{report.mission_tags?.unknown || 0}</span>
              </div>
              {report.mission_tags?.top_unknown && report.mission_tags.top_unknown.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">Top Unknown:</p>
                  {report.mission_tags.top_unknown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{item.value}</span>
                      <span className="text-gray-500">×{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Mapping Tables</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Countries</div>
              <div className="text-2xl font-bold text-blue-600">{report.mapping_tables?.countries || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Levels</div>
              <div className="text-2xl font-bold text-blue-600">{report.mapping_tables?.levels || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Tags</div>
              <div className="text-2xl font-bold text-blue-600">{report.mapping_tables?.tags || 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview Samples</h2>
          <button
            onClick={fetchPreview}
            disabled={previewLoading}
            className="mb-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {previewLoading ? 'Loading...' : 'Preview 10 Samples'}
          </button>

          {preview && preview.previews && preview.previews.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Raw</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Normalized</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dropped</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.previews.map((item) => (
                    <tr key={item.job_id}>
                      <td className="px-3 py-2 text-xs text-gray-900">
                        {item.raw.org_name} - {item.raw.title}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        <div>C: {item.raw.country || 'N/A'}</div>
                        <div>L: {item.raw.level_norm || 'N/A'}</div>
                        <div>T: {item.raw.mission_tags?.join(', ') || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        <div>C: {item.normalized.country_iso || 'N/A'}</div>
                        <div>L: {item.normalized.level_norm || 'N/A'}</div>
                        <div>T: {item.normalized.mission_tags?.join(', ') || '[]'}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-orange-600">
                        {item.dropped_fields.length > 0 ? (
                          <ul className="list-disc list-inside">
                            {item.dropped_fields.map((field, idx) => (
                              <li key={idx}>{field}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-green-600">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="flex gap-4">
            <button
              onClick={handleNormalizeReindex}
              disabled={reindexing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {reindexing ? 'Processing...' : 'Normalize & Reindex'}
            </button>
            <button
              onClick={handleReindexOnly}
              disabled={reindexing}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              {reindexing ? 'Processing...' : 'Reindex Only'}
            </button>
            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Refresh Report
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
