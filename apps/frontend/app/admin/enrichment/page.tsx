'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, TrendingUp, BarChart3, Users, Flag, Activity } from 'lucide-react';
import { toast } from 'sonner';

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

export default function EnrichmentQualityPage() {
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/enrichment/quality-dashboard', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Authentication required. Please login.');
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
      toast.error(error instanceof Error ? error.message : 'Failed to fetch quality dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const response = await fetch('/api/admin/enrichment/review-queue?limit=20', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Authentication required. Please login.');
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
      toast.error(error instanceof Error ? error.message : 'Failed to fetch review queue');
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchDashboard(), fetchReviews()]);
    toast.success('Dashboard refreshed');
  }, [fetchDashboard, fetchReviews]);

  useEffect(() => {
    fetchDashboard();
    fetchReviews();
  }, [fetchDashboard, fetchReviews]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-[#86868B] text-body">Loading quality dashboard...</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="h-full p-4 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="text-caption text-[#FF3B30]">
              Failed to load quality dashboard. Check console for details.
            </div>
          </div>
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

  // Calculate quality score (0-100)
  const calculateQualityScore = () => {
    let score = 0;
    let total = 0;
    
    // Average confidence (0-1) -> 0-40 points
    total += 40;
    score += avgConfidence * 40;
    
    // Low confidence percentage (inverse, max 30 points)
    total += 30;
    score += Math.max(0, 30 - (lowConfPct / 100) * 30);
    
    // Bias indicators (max 30 points)
    total += 30;
    const biasPenalty = (washHealthPct > 40 ? 15 : 0) + (maxExpLevelPct > 50 ? 15 : 0);
    score += Math.max(0, 30 - biasPenalty);
    
    return total > 0 ? Math.round((score / total) * 100) : 0;
  };

  const qualityScore = calculateQualityScore();
  const qualityColor = qualityScore >= 80 ? '#34D399' : qualityScore >= 50 ? '#FCD34D' : '#F87171';

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold text-[#1D1D1F] mb-1">Enrichment Quality</h1>
            <p className="text-caption text-[#86868B]">Monitor pipeline quality and bias indicators</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || reviewsLoading}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F5F5F7] hover:bg-[#E5E5E7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
          >
            <RefreshCw className={`w-4 h-4 text-[#86868B] ${loading || reviewsLoading ? 'animate-spin' : ''}`} />
            <span className="absolute right-0 top-full mt-2 px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              Refresh dashboard
            </span>
          </button>
        </div>

        {/* Quality Score */}
        <div className="bg-white border border-[#D2D2D7] rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#86868B]" />
              <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Quality Score</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-semibold text-[#1D1D1F]">{qualityScore}%</div>
                <div className="text-caption text-[#86868B]">Overall</div>
              </div>
              <div className="w-12 h-12 rounded-full border-4 border-[#F5F5F7] flex items-center justify-center relative" style={{
                borderTopColor: qualityColor,
                borderRightColor: qualityScore >= 50 ? qualityColor : '#F5F5F7',
                borderBottomColor: qualityScore >= 75 ? qualityColor : '#F5F5F7',
                borderLeftColor: qualityScore >= 100 ? qualityColor : '#F5F5F7',
                transform: 'rotate(-90deg)',
              }}>
                <div className="w-8 h-8 rounded-full bg-white"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Total Enriched</h2>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-caption text-[#86868B]">Jobs</span>
                <span className="text-2xl font-semibold text-[#1D1D1F]">
                  {total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Avg Confidence</h2>
              </div>
              {avgConfidence >= 0.70 ? (
                <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
              ) : (
                <AlertCircle className="w-4 h-4 text-[#FF3B30]" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-caption text-[#86868B]">Score</span>
                <span className="text-2xl font-semibold text-[#1D1D1F]">
                  {avgConfidence.toFixed(3)}
                </span>
              </div>
              <div className="text-caption text-[#86868B]">
                {avgConfidence >= 0.70 ? 'Good (≥0.70)' : 'Low (<0.70)'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Low Confidence</h2>
              </div>
              {lowConfPct < 20 ? (
                <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
              ) : (
                <AlertCircle className="w-4 h-4 text-[#FF3B30]" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-caption text-[#86868B]">Count</span>
                <span className="text-2xl font-semibold text-[#1D1D1F]">
                  {lowConfCount}
                </span>
              </div>
              <div className="text-caption text-[#86868B]">
                {lowConfPct.toFixed(1)}% {lowConfPct < 20 ? '(Good)' : '(High)'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-[#86868B]" />
                <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Review Queue</h2>
              </div>
              {pendingCount === 0 ? (
                <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
              ) : (
                <div className="w-2 h-2 bg-[#FCD34D] rounded-full"></div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-caption text-[#86868B]">Pending</span>
                <span className="text-2xl font-semibold text-[#1D1D1F]">
                  {pendingCount}
                </span>
              </div>
              <div className="text-caption text-[#86868B]">Jobs awaiting review</div>
            </div>
          </div>
        </div>

        {/* Bias Indicators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-[#86868B]" />
              <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Bias Indicators</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-caption text-[#86868B]">WASH + Public Health</span>
                <div className="flex items-center gap-2">
                  <span className="text-body font-semibold text-[#1D1D1F]">
                    {washHealthPct.toFixed(1)}%
                  </span>
                  {washHealthPct > 40 ? (
                    <AlertCircle className="w-4 h-4 text-[#FF3B30]" />
                  ) : (
                    <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-caption text-[#86868B]">Max Experience Level</span>
                <div className="flex items-center gap-2">
                  <span className="text-body font-semibold text-[#1D1D1F]">
                    {maxExpLevelPct.toFixed(1)}%
                  </span>
                  {maxExpLevelPct > 50 ? (
                    <AlertCircle className="w-4 h-4 text-[#FF3B30]" />
                  ) : (
                    <div className="w-2 h-2 bg-[#30D158] rounded-full"></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Experience Level Distribution */}
          <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-[#86868B]" />
              <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Experience Levels</h2>
            </div>
            <div className="space-y-2">
              {expLevels.length === 0 ? (
                <div className="text-caption text-[#86868B]">No data available</div>
              ) : (
                Object.entries(expLevelDist)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 5)
                  .map(([level, count]) => {
                    const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                    return (
                      <div key={level} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-caption text-[#1D1D1F]">{level}</span>
                            <span className="text-caption text-[#86868B]">
                              {count} ({pct.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-[#F5F5F7] rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-[#0071E3]"
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
        </div>

        {/* Impact Domain Distribution */}
        <div className="bg-white border border-[#D2D2D7] rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[#86868B]" />
            <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Impact Domains</h2>
          </div>
          <div className="space-y-2">
            {Object.keys(impactDomainDist).length === 0 ? (
              <div className="text-caption text-[#86868B]">No data available</div>
            ) : (
              Object.entries(impactDomainDist)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 8)
                .map(([domain, count]) => {
                  const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                  return (
                    <div key={domain} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-caption text-[#1D1D1F]">{domain}</span>
                          <span className="text-caption text-[#86868B]">
                            {count} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-[#F5F5F7] rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-[#34D399]"
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
        <div className="bg-white border border-[#D2D2D7] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="w-4 h-4 text-[#86868B]" />
            <h2 className="text-body-lg font-semibold text-[#1D1D1F]">Review Queue</h2>
            {reviews.length > 0 && (
              <span className="px-2 py-0.5 bg-[#F5F5F7] text-caption text-[#86868B] rounded">
                {reviews.length}
              </span>
            )}
          </div>
          {reviewsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-4 h-4 animate-spin text-[#86868B]" />
              <span className="ml-2 text-caption text-[#86868B]">Loading reviews...</span>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-[#30D158]" />
              <div className="text-caption text-[#86868B]">
                No jobs in review queue. All enrichments have high confidence.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {reviews.map((review) => {
                const job = review.job || {};
                const enrichment = review.original_enrichment || {};
                const impactDomains = Array.isArray(enrichment.impact_domain) 
                  ? enrichment.impact_domain 
                  : [];
                const confidence = enrichment.confidence_overall || 0;
                
                return (
                  <div key={review.id} className="border border-[#D2D2D7] rounded-lg p-3 hover:bg-[#F5F5F7] transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-body-sm font-semibold text-[#1D1D1F] truncate mb-2">
                          {job.title || 'Unknown Job'}
                        </h3>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {impactDomains.length > 0 ? (
                            impactDomains.slice(0, 2).map((domain, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-[#F5F5F7] text-caption-sm text-[#1D1D1F] rounded">
                                {domain}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 bg-[#F5F5F7] text-caption-sm text-[#86868B] rounded">
                              No domain
                            </span>
                          )}
                          {enrichment.experience_level && (
                            <span className="px-2 py-0.5 bg-[#F5F5F7] text-caption-sm text-[#1D1D1F] rounded">
                              {enrichment.experience_level}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-caption-sm ${
                            confidence >= 0.70
                              ? 'bg-[#34D399]/20 text-[#34D399]'
                              : confidence >= 0.50
                              ? 'bg-[#FCD34D]/20 text-[#FCD34D]'
                              : 'bg-[#F87171]/20 text-[#F87171]'
                          }`}>
                            {(confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        {review.reason && (
                          <div className="text-caption-sm text-[#86868B]">
                            {review.reason}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`px-2 py-1 rounded text-caption-sm font-medium ${
                          review.status === 'pending' ? 'bg-[#FCD34D]/20 text-[#FCD34D]' :
                          review.status === 'approved' ? 'bg-[#34D399]/20 text-[#34D399]' :
                          'bg-[#F5F5F7] text-[#86868B]'
                        }`}>
                          {review.status || 'unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
