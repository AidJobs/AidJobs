'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Activity, CheckCircle, XCircle, AlertCircle, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

type AnalyticsOverview = {
  last_7_days: {
    total_sources: number;
    total_crawls: number;
    successful_crawls: number;
    failed_crawls: number;
    warning_crawls: number;
    avg_duration_ms: number;
    total_jobs_found: number;
    total_jobs_inserted: number;
    total_jobs_updated: number;
  };
  last_30_days: {
    total_sources: number;
    total_crawls: number;
    successful_crawls: number;
    failed_crawls: number;
    warning_crawls: number;
    avg_duration_ms: number;
    total_jobs_found: number;
    total_jobs_inserted: number;
    total_jobs_updated: number;
  };
  daily_trends: Array<{
    date: string;
    total_crawls: number;
    successful_crawls: number;
    failed_crawls: number;
    success_rate: number;
  }>;
  top_sources: Array<{
    source_id: string;
    org_name: string;
    crawl_count: number;
    total_jobs_found: number;
    total_changes: number;
    avg_duration_ms: number;
    success_rate: number;
  }>;
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceAnalytics, setSourceAnalytics] = useState<any>(null);
  const [loadingSource, setLoadingSource] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/crawl/analytics/overview', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Authentication required. Please login.');
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'ok') {
        setAnalytics(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSourceAnalytics = useCallback(async (sourceId: string) => {
    setLoadingSource(true);
    try {
      const response = await fetch(`/api/admin/crawl/analytics/source/${sourceId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'ok') {
        setSourceAnalytics(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch source analytics');
      }
    } catch (error) {
      console.error('Failed to fetch source analytics:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch source analytics');
    } finally {
      setLoadingSource(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (selectedSource) {
      fetchSourceAnalytics(selectedSource);
    }
  }, [selectedSource, fetchSourceAnalytics]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-[#86868B]" />
          <p className="text-[#86868B]">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-[#86868B]" />
          <p className="text-[#86868B]">No analytics data available</p>
        </div>
      </div>
    );
  }

  const weekSuccessRate = analytics.last_7_days.total_crawls > 0
    ? (analytics.last_7_days.successful_crawls / analytics.last_7_days.total_crawls) * 100
    : 0;

  const monthSuccessRate = analytics.last_30_days.total_crawls > 0
    ? (analytics.last_30_days.successful_crawls / analytics.last_30_days.total_crawls) * 100
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#1D1D1F] mb-2">Crawl Analytics</h1>
              <p className="text-[#86868B]">Monitor crawl performance and trends</p>
            </div>
            <button
              onClick={fetchAnalytics}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-lg hover:bg-[#0051D5] transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="p-6 rounded-xl border border-[#D2D2D7] bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#86868B]">Success Rate (7d)</span>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-[#1D1D1F]">
              {weekSuccessRate.toFixed(1)}%
            </div>
            <div className="text-xs text-[#86868B] mt-1">
              {analytics.last_7_days.successful_crawls} / {analytics.last_7_days.total_crawls} crawls
            </div>
          </div>

          <div className="p-6 rounded-xl border border-[#D2D2D7] bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#86868B]">Total Crawls (7d)</span>
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-[#1D1D1F]">
              {analytics.last_7_days.total_crawls}
            </div>
            <div className="text-xs text-[#86868B] mt-1">
              Across {analytics.last_7_days.total_sources} sources
            </div>
          </div>

          <div className="p-6 rounded-xl border border-[#D2D2D7] bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#86868B]">Jobs Found (7d)</span>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-[#1D1D1F]">
              {analytics.last_7_days.total_jobs_found?.toLocaleString() || 0}
            </div>
            <div className="text-xs text-[#86868B] mt-1">
              {analytics.last_7_days.total_jobs_inserted || 0} inserted, {analytics.last_7_days.total_jobs_updated || 0} updated
            </div>
          </div>

          <div className="p-6 rounded-xl border border-[#D2D2D7] bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#86868B]">Avg Duration</span>
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-[#1D1D1F]">
              {analytics.last_7_days.avg_duration_ms ? (analytics.last_7_days.avg_duration_ms / 1000).toFixed(1) : '0'}s
            </div>
            <div className="text-xs text-[#86868B] mt-1">
              Per crawl
            </div>
          </div>
        </div>

        {/* Daily Trends */}
        <div className="bg-white rounded-xl border border-[#D2D2D7] p-6 mb-8">
          <h2 className="text-xl font-semibold text-[#1D1D1F] mb-4">Daily Trends (Last 7 Days)</h2>
          <div className="space-y-3">
            {analytics.daily_trends.map((trend, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-24 text-sm text-[#86868B]">
                  {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-[#F5F5F7] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-green-600 transition-all"
                        style={{ width: `${trend.success_rate}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-[#1D1D1F] w-16 text-right">
                      {trend.success_rate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#86868B]">
                    <span>{trend.total_crawls} crawls</span>
                    <span className="text-green-600">{trend.successful_crawls} success</span>
                    {trend.failed_crawls > 0 && (
                      <span className="text-red-600">{trend.failed_crawls} failed</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Sources */}
        <div className="bg-white rounded-xl border border-[#D2D2D7] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#D2D2D7]">
            <h2 className="text-xl font-semibold text-[#1D1D1F]">Top Performing Sources</h2>
            <p className="text-sm text-[#86868B] mt-1">Sources with highest activity in the last 7 days</p>
          </div>
          
          <div className="divide-y divide-[#D2D2D7]">
            {analytics.top_sources.map((source) => (
              <div
                key={source.source_id}
                onClick={() => setSelectedSource(source.source_id)}
                className={`p-6 hover:bg-[#F5F5F7] cursor-pointer transition-colors ${
                  selectedSource === source.source_id ? 'bg-[#F5F5F7]' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-[#1D1D1F]">{source.org_name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        source.success_rate >= 90 ? 'bg-green-50 text-green-700' :
                        source.success_rate >= 70 ? 'bg-yellow-50 text-yellow-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {source.success_rate.toFixed(1)}% success
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-[#86868B]">
                        <span className="font-medium text-[#1D1D1F]">{source.crawl_count}</span> crawls
                      </span>
                      <span className="text-[#86868B]">
                        <span className="font-medium text-[#1D1D1F]">{source.total_jobs_found}</span> jobs found
                      </span>
                      <span className="text-[#86868B]">
                        <span className="font-medium text-[#1D1D1F]">{source.total_changes}</span> changes
                      </span>
                      <span className="text-[#86868B]">
                        Avg: <span className="font-medium text-[#1D1D1F]">{(source.avg_duration_ms / 1000).toFixed(1)}s</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Source Details Modal */}
        {selectedSource && sourceAnalytics && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#D2D2D7] px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#1D1D1F]">
                  Analytics: {sourceAnalytics.source.org_name}
                </h2>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    setSourceAnalytics(null);
                  }}
                  className="p-2 hover:bg-[#F5F5F7] rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-[#86868B]" />
                </button>
              </div>
              
              {loadingSource ? (
                <div className="p-12 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-[#86868B]" />
                  <p className="text-[#86868B]">Loading source analytics...</p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* Health Score */}
                  {sourceAnalytics.health && (
                    <div className="p-6 rounded-xl border border-[#D2D2D7] bg-white">
                      <h3 className="font-semibold text-[#1D1D1F] mb-4">Health Score</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-sm text-[#86868B] mb-1">Overall</div>
                          <div className="text-2xl font-bold text-[#1D1D1F]">
                            {sourceAnalytics.health.score}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-[#86868B] mb-1">Reliability</div>
                          <div className="text-xl font-semibold text-[#1D1D1F]">
                            {sourceAnalytics.health.components.reliability}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-[#86868B] mb-1">Activity</div>
                          <div className="text-xl font-semibold text-[#1D1D1F]">
                            {sourceAnalytics.health.components.activity}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-[#86868B] mb-1">Quality</div>
                          <div className="text-xl font-semibold text-[#1D1D1F]">
                            {sourceAnalytics.health.components.quality}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Statistics */}
                  {sourceAnalytics.statistics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg border border-[#D2D2D7]">
                        <div className="text-sm text-[#86868B] mb-1">Total Crawls</div>
                        <div className="text-2xl font-bold text-[#1D1D1F]">
                          {sourceAnalytics.statistics.total_crawls || 0}
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-[#D2D2D7]">
                        <div className="text-sm text-[#86868B] mb-1">Success Rate</div>
                        <div className="text-2xl font-bold text-[#1D1D1F]">
                          {sourceAnalytics.statistics.successful_crawls && sourceAnalytics.statistics.total_crawls
                            ? ((sourceAnalytics.statistics.successful_crawls / sourceAnalytics.statistics.total_crawls) * 100).toFixed(1)
                            : 0}%
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-[#D2D2D7]">
                        <div className="text-sm text-[#86868B] mb-1">Jobs Found</div>
                        <div className="text-2xl font-bold text-[#1D1D1F]">
                          {sourceAnalytics.statistics.total_jobs_found || 0}
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-[#D2D2D7]">
                        <div className="text-sm text-[#86868B] mb-1">Avg Duration</div>
                        <div className="text-2xl font-bold text-[#1D1D1F]">
                          {sourceAnalytics.statistics.avg_duration_ms
                            ? (sourceAnalytics.statistics.avg_duration_ms / 1000).toFixed(1)
                            : 0}s
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recent Crawls */}
                  {sourceAnalytics.recent_crawls && sourceAnalytics.recent_crawls.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-[#1D1D1F] mb-3">Recent Crawls</h3>
                      <div className="space-y-2">
                        {sourceAnalytics.recent_crawls.map((crawl: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-lg border border-[#D2D2D7]">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {crawl.status === 'ok' ? (
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                ) : crawl.status === 'fail' ? (
                                  <XCircle className="w-4 h-4 text-red-600" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                                )}
                                <span className="text-sm font-medium text-[#1D1D1F]">
                                  {new Date(crawl.ran_at).toLocaleString()}
                                </span>
                              </div>
                              <span className="text-xs text-[#86868B]">
                                {(crawl.duration_ms / 1000).toFixed(1)}s
                              </span>
                            </div>
                            <div className="text-sm text-[#86868B] mb-2">{crawl.message}</div>
                            <div className="flex items-center gap-4 text-xs text-[#86868B]">
                              <span>Found: {crawl.found}</span>
                              <span>Inserted: {crawl.inserted}</span>
                              <span>Updated: {crawl.updated}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

