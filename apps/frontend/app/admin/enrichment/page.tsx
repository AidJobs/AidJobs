'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, TrendingUp, BarChart3, Users, Flag } from 'lucide-react';

type QualityDashboard = {
  total_enriched: number;
  experience_level_distribution: Record<string, number>;
  impact_domain_distribution: Record<string, number>;
  confidence_statistics: {
    average: number;
    min: number;
    max: number;
    low_confidence_count: number;
  };
  review_queue_status: {
    pending_count: number;
    needs_review_count: number;
  };
};

type ReviewItem = {
  id: string;
  job: {
    id: string;
    title: string;
  };
  original_enrichment: {
    impact_domain: string[];
    experience_level: string;
    confidence_overall: number;
  };
  reason: string;
  status: string;
};

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

export default function EnrichmentQualityPage() {
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/enrichment/quality-dashboard');
      if (!response.ok) {
        if (response.status === 401) {
          addToast('Authentication required. Please login.', 'error');
          return;
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'ok') {
        setDashboard(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch dashboard');
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      addToast(error instanceof Error ? error.message : 'Failed to fetch quality dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const response = await fetch('/api/admin/enrichment/review-queue?limit=20');
      if (!response.ok) {
        if (response.status === 401) {
          addToast('Authentication required. Please login.', 'error');
          return;
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'ok') {
        setReviews(data.data.reviews || []);
      } else {
        throw new Error(data.error || 'Failed to fetch review queue');
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      addToast(error instanceof Error ? error.message : 'Failed to fetch review queue', 'error');
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchReviews();
  }, [fetchDashboard, fetchReviews]);

  const getStatusIcon = (condition: boolean) => {
    return condition ? (
      <CheckCircle className="w-5 h-5 text-green-600" />
    ) : (
      <AlertCircle className="w-5 h-5 text-orange-600" />
    );
  };

  const getStatusText = (condition: boolean, goodText: string, warnText: string) => {
    return condition ? goodText : warnText;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-600">Loading quality dashboard...</span>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load quality dashboard. Check console for details.</p>
        </div>
      </div>
    );
  }

  // Safe property access with defaults
  const total = dashboard.total_enriched || 0;
  const confidenceStats = dashboard.confidence_statistics || {};
  const avgConfidence = confidenceStats.average || 0;
  const lowConfCount = confidenceStats.low_confidence_count || 0;
  const lowConfPct = total > 0 ? (lowConfCount / total) * 100 : 0;

  // Calculate WASH + Public Health percentage
  const impactDomainDist = dashboard.impact_domain_distribution || {};
  const washCount = impactDomainDist.WASH || 0;
  const healthCount = impactDomainDist['Public Health'] || 0;
  const washHealthPct = total > 0 ? ((washCount + healthCount) / total) * 100 : 0;

  // Check for bias in experience level
  const expLevelDist = dashboard.experience_level_distribution || {};
  const expLevels = Object.entries(expLevelDist);
  const maxExpLevelPct = total > 0 && expLevels.length > 0
    ? Math.max(...expLevels.map(([_, count]) => (count / total) * 100))
    : 0;

  const reviewQueueStatus = dashboard.review_queue_status || {};
  const pendingCount = reviewQueueStatus.pending_count || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enrichment Quality Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor enrichment pipeline quality and bias</p>
        </div>
        <button
          onClick={() => { fetchDashboard(); fetchReviews(); }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Enriched</p>
              <p className="text-2xl font-bold text-gray-900">{total.toLocaleString()}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Confidence</p>
              <p className="text-2xl font-bold text-gray-900">{avgConfidence.toFixed(3)}</p>
            </div>
            {getStatusIcon(avgConfidence >= 0.70)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {getStatusText(avgConfidence >= 0.70, 'Good (>=0.70)', 'Low (<0.70)')}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Low Confidence</p>
              <p className="text-2xl font-bold text-gray-900">{lowConfCount}</p>
            </div>
            {getStatusIcon(lowConfPct < 20)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {lowConfPct.toFixed(1)}% {getStatusText(lowConfPct < 20, '(Good)', '(High)')}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Review Queue</p>
              <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
            </div>
            <Flag className="w-8 h-8 text-orange-600" />
          </div>
          <p className="text-xs text-gray-500 mt-1">Pending reviews</p>
        </div>
      </div>

      {/* Bias Indicators */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          Bias Indicators
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${washHealthPct > 40 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">WASH + Public Health</span>
              {getStatusIcon(washHealthPct <= 40)}
            </div>
            <p className="text-2xl font-bold mt-2">{washHealthPct.toFixed(1)}%</p>
            <p className="text-sm text-gray-600 mt-1">
              {washHealthPct > 40 ? '⚠ Potential bias (>40%)' : '✓ Balanced (<40%)'}
            </p>
          </div>

          <div className={`p-4 rounded-lg ${maxExpLevelPct > 50 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Max Experience Level</span>
              {getStatusIcon(maxExpLevelPct <= 50)}
            </div>
            <p className="text-2xl font-bold mt-2">{maxExpLevelPct.toFixed(1)}%</p>
            <p className="text-sm text-gray-600 mt-1">
              {maxExpLevelPct > 50 ? '⚠ Potential bias (>50%)' : '✓ Balanced (<50%)'}
            </p>
          </div>
        </div>
      </div>

      {/* Experience Level Distribution */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Users className="w-5 h-5 mr-2" />
          Experience Level Distribution
        </h2>
        <div className="space-y-3">
          {expLevels.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No experience level data available</p>
          ) : (
            Object.entries(expLevelDist)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([level, count]) => {
                const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                const isHigh = pct > 50;
                return (
                  <div key={level} className="flex items-center">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{level}</span>
                        <span className="text-sm text-gray-600">{count} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${isHigh ? 'bg-orange-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                    {isHigh && <AlertCircle className="w-4 h-4 text-orange-600 ml-2" />}
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Impact Domain Distribution */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Impact Domain Distribution
        </h2>
        <div className="space-y-3">
          {Object.keys(impactDomainDist).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No impact domain data available</p>
          ) : (
            Object.entries(impactDomainDist)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([domain, count]) => {
                const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                return (
                  <div key={domain} className="flex items-center">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{domain}</span>
                        <span className="text-sm text-gray-600">{count} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Review Queue */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Flag className="w-5 h-5 mr-2" />
          Review Queue ({reviews.length} jobs)
        </h2>
        {reviewsLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading reviews...</span>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p>No jobs in review queue. All enrichments have high confidence.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => {
              const job = review.job || {};
              const enrichment = review.original_enrichment || {};
              const impactDomains = Array.isArray(enrichment.impact_domain) 
                ? enrichment.impact_domain 
                : [];
              const confidence = enrichment.confidence_overall || 0;
              
              return (
                <div key={review.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{job.title || 'Unknown Job'}</h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                          {impactDomains.length > 0 ? impactDomains.join(', ') : 'None'}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                          {enrichment.experience_level || 'None'}
                        </span>
                        <span className={`px-2 py-1 rounded ${
                          confidence >= 0.70
                            ? 'bg-green-100 text-green-800'
                            : confidence >= 0.50
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          Confidence: {(confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">Reason: {review.reason || 'N/A'}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      review.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                      review.status === 'approved' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {review.status || 'unknown'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 space-y-2 z-50">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-lg shadow-lg ${
                toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

