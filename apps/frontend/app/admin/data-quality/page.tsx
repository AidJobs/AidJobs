'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Database, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { toast } from 'sonner';

type SourceQuality = {
  source_id: string;
  source_name: string | null;
  source_url: string;
  total_jobs: number;
  unique_urls: number;
  null_urls: number;
  listing_page_urls: number;
  missing_titles: number;
  short_titles: number;
  duplicate_urls: Array<{
    url: string;
    count: number;
    titles: string[];
  }>;
  quality_score: number;
};

type GlobalQuality = {
  total_jobs: number;
  total_sources: number;
  unique_urls: number;
  null_urls: number;
  listing_page_urls: number;
  sources_with_issues: number;
  global_quality_score: number;
  top_issue_sources: Array<{
    source_id: string;
    issue_count: number;
  }>;
};

export default function DataQualityPage() {
  const [globalQuality, setGlobalQuality] = useState<GlobalQuality | null>(null);
  const [sources, setSources] = useState<SourceQuality[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceDetails, setSourceDetails] = useState<SourceQuality | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchGlobalQuality = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/data-quality/global', {
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
        setGlobalQuality(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch global quality');
      }
    } catch (error) {
      console.error('Failed to fetch global quality:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch global quality');
    }
  }, []);

  const fetchSourceQuality = useCallback(async (sourceId: string) => {
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/admin/data-quality/source/${sourceId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'ok' && data.data) {
        // Ensure quality_score exists
        if (typeof data.data.quality_score !== 'number') {
          data.data.quality_score = 0;
        }
        setSourceDetails(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch source quality');
      }
    } catch (error) {
      console.error('Failed to fetch source quality:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch source quality');
      setSourceDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const fetchAllSources = useCallback(async () => {
    // For now, we'll fetch top issue sources from global quality
    // In a full implementation, we'd have a list endpoint
    if (globalQuality?.top_issue_sources) {
      const sourcePromises = globalQuality.top_issue_sources.slice(0, 10).map(source =>
        fetch(`/api/admin/data-quality/source/${source.source_id}`, {
          credentials: 'include',
        }).then(res => res.json())
      );
      
      const results = await Promise.allSettled(sourcePromises);
      const qualityData = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.status === 'ok' && r.data)
        .map(r => r.data);
      setSources(qualityData);
    }
  }, [globalQuality]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchGlobalQuality();
      setLoading(false);
    };
    loadData();
  }, [fetchGlobalQuality]);

  useEffect(() => {
    if (globalQuality) {
      fetchAllSources();
    }
  }, [globalQuality, fetchAllSources]);

  useEffect(() => {
    if (selectedSource) {
      fetchSourceQuality(selectedSource);
    }
  }, [selectedSource, fetchSourceQuality]);

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualityBg = (score: number) => {
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  // Quality Metric Card Component with Tooltip
  function QualityMetricCard({ label, value, subtitle, icon, tooltip, score, getQualityBg, getQualityColor }: {
    label: string;
    value: string;
    subtitle: string;
    icon: React.ReactNode;
    tooltip: string;
    score: number | null;
    getQualityBg: (score: number) => string;
    getQualityColor: (score: number) => string;
  }) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
    const iconRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect();
        setTooltipPosition({
          left: rect.left + rect.width / 2,
          top: rect.top - 8,
        });
      }
      setShowTooltip(true);
    };

    const bgClass = score !== null ? getQualityBg(score) : 'bg-white';
    const borderClass = score !== null ? 'border-2' : 'border';
    const valueColor = score !== null ? getQualityColor(score) : 'text-[#1D1D1F]';

    return (
      <div className={`p-6 rounded-xl ${borderClass} ${bgClass} relative`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[#86868B]">{label}</span>
          <div
            ref={iconRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShowTooltip(false)}
            className="relative cursor-help"
          >
            {icon}
            {showTooltip && (
              <div
                className="fixed px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded shadow-lg pointer-events-none whitespace-normal max-w-xs z-[9999]"
                style={{
                  left: `${tooltipPosition.left}px`,
                  top: `${tooltipPosition.top}px`,
                  transform: 'translate(-50%, -100%)',
                  marginTop: '-4px',
                }}
              >
                {tooltip}
                <div
                  className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1D1D1F]"
                />
              </div>
            )}
          </div>
        </div>
        <div className={`text-3xl font-bold ${valueColor}`}>
          {value}
        </div>
        <div className="text-xs text-[#86868B] mt-1">{subtitle}</div>
      </div>
    );
  }

  // Issue Card Component with Tooltip
  function IssueCard({ icon, title, value, description, tooltip }: {
    icon: React.ReactNode;
    title: string;
    value: string;
    description: string;
    tooltip: string;
  }) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
    const iconRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect();
        setTooltipPosition({
          left: rect.left + rect.width / 2,
          top: rect.top - 8,
        });
      }
      setShowTooltip(true);
    };

    return (
      <div className="p-6 rounded-xl border border-[#D2D2D7] bg-white relative">
        <div className="flex items-center gap-2 mb-4">
          <div
            ref={iconRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setShowTooltip(false)}
            className="relative cursor-help"
          >
            {icon}
            {showTooltip && (
              <div
                className="fixed px-2 py-1 bg-[#1D1D1F] text-white text-xs rounded shadow-lg pointer-events-none whitespace-normal max-w-xs z-[9999]"
                style={{
                  left: `${tooltipPosition.left}px`,
                  top: `${tooltipPosition.top}px`,
                  transform: 'translate(-50%, -100%)',
                  marginTop: '-4px',
                }}
              >
                {tooltip}
                <div
                  className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1D1D1F]"
                />
              </div>
            )}
          </div>
          <h3 className="font-semibold text-[#1D1D1F]">{title}</h3>
        </div>
        <div className="text-2xl font-bold text-[#1D1D1F] mb-2">
          {value}
        </div>
        <div className="text-sm text-[#86868B]">
          {description}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-[#86868B]" />
          <p className="text-[#86868B]">Loading data quality metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#1D1D1F] mb-2">Data Quality</h1>
              <p className="text-[#86868B]">Monitor and improve data quality across all sources</p>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                fetchGlobalQuality().finally(() => setLoading(false));
              }}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-lg hover:bg-[#0051D5] transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Global Quality Overview */}
        {globalQuality && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <QualityMetricCard
              label="Global Quality Score"
              value={(globalQuality.global_quality_score ?? 0).toFixed(1)}
              subtitle="Out of 100"
              icon={<Database className="w-5 h-5 text-[#86868B]" />}
              tooltip="Overall data quality score across all sources. 80+ is excellent, 60-79 is good, below 60 needs attention."
              score={globalQuality.global_quality_score ?? 0}
              getQualityBg={getQualityBg}
              getQualityColor={getQualityColor}
            />

            <QualityMetricCard
              label="Total Jobs"
              value={globalQuality.total_jobs.toLocaleString()}
              subtitle={`Across ${globalQuality.total_sources} sources`}
              icon={<CheckCircle className="w-5 h-5 text-green-600" />}
              tooltip="Total number of jobs in the system across all sources."
              score={null}
              getQualityBg={getQualityBg}
              getQualityColor={getQualityColor}
            />

            <QualityMetricCard
              label="Unique URLs"
              value={(globalQuality.unique_urls ?? 0).toLocaleString()}
              subtitle={`${globalQuality.total_jobs > 0 ? ((globalQuality.unique_urls ?? 0) / globalQuality.total_jobs * 100).toFixed(1) : '0.0'}% uniqueness`}
              icon={<TrendingUp className="w-5 h-5 text-green-600" />}
              tooltip="Number of unique apply URLs. Higher uniqueness means less duplicate job postings."
              score={null}
              getQualityBg={getQualityBg}
              getQualityColor={getQualityColor}
            />

            <QualityMetricCard
              label="Issues Detected"
              value={(globalQuality.null_urls + globalQuality.listing_page_urls).toLocaleString()}
              subtitle={`${globalQuality.sources_with_issues} sources affected`}
              icon={<AlertTriangle className="w-5 h-5 text-yellow-600" />}
              tooltip="Total number of jobs with data quality issues (missing URLs, listing page URLs instead of detail pages)."
              score={null}
              getQualityBg={getQualityBg}
              getQualityColor={getQualityColor}
            />
          </div>
        )}

        {/* Issue Breakdown */}
        {globalQuality && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <IssueCard
              icon={<XCircle className="w-5 h-5 text-red-600" />}
              title="Null URLs"
              value={globalQuality.null_urls.toLocaleString()}
              description="Jobs missing apply URLs"
              tooltip="Jobs that don't have an application URL. These jobs cannot be applied to directly and need to be fixed."
            />

            <IssueCard
              icon={<AlertTriangle className="w-5 h-5 text-yellow-600" />}
              title="Listing Page URLs"
              value={globalQuality.listing_page_urls.toLocaleString()}
              description="Jobs pointing to listing pages instead of detail pages"
              tooltip="Jobs where the apply URL points to a job listing page instead of the specific job detail page. Users would need to search for the job again."
            />

            <IssueCard
              icon={<Info className="w-5 h-5 text-blue-600" />}
              title="Sources with Issues"
              value={globalQuality.sources_with_issues.toString()}
              description="Sources requiring attention"
              tooltip="Number of sources that have at least one data quality issue. Click on sources in the list below to see detailed quality reports."
            />
          </div>
        )}

        {/* Sources List */}
        <div className="bg-white rounded-xl border border-[#D2D2D7] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#D2D2D7]">
            <h2 className="text-xl font-semibold text-[#1D1D1F]">Source Quality Reports</h2>
            <p className="text-sm text-[#86868B] mt-1">Click on a source to view detailed quality metrics</p>
          </div>
          
          {sources.length === 0 ? (
            <div className="p-12 text-center">
              <Database className="w-12 h-12 mx-auto mb-4 text-[#86868B]" />
              <p className="text-[#86868B]">No source quality data available</p>
            </div>
          ) : (
            <div className="divide-y divide-[#D2D2D7]">
              {sources.map((source) => (
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
                        <h3 className="font-semibold text-[#1D1D1F]">
                          {source.source_name || 'Unnamed Source'}
                        </h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getQualityBg(source.quality_score || 0)} ${getQualityColor(source.quality_score || 0)}`}>
                          Score: {(source.quality_score ?? 0).toFixed(1)}
                        </span>
                      </div>
                      <p className="text-sm text-[#86868B] mb-3">{source.source_url}</p>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-[#86868B]">
                          <span className="font-medium text-[#1D1D1F]">{source.total_jobs}</span> jobs
                        </span>
                        <span className="text-[#86868B]">
                          <span className="font-medium text-[#1D1D1F]">{source.unique_urls}</span> unique URLs
                        </span>
                        {source.null_urls > 0 && (
                          <span className="text-red-600">
                            <span className="font-medium">{source.null_urls}</span> null URLs
                          </span>
                        )}
                        {source.listing_page_urls > 0 && (
                          <span className="text-yellow-600">
                            <span className="font-medium">{source.listing_page_urls}</span> listing URLs
                          </span>
                        )}
                        {source.duplicate_urls.length > 0 && (
                          <span className="text-orange-600">
                            <span className="font-medium">{source.duplicate_urls.length}</span> duplicates
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source Details Modal */}
        {selectedSource && sourceDetails && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#D2D2D7] px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#1D1D1F]">
                  Quality Details: {sourceDetails.source_name || 'Unnamed Source'}
                </h2>
                <button
                  onClick={() => {
                    setSelectedSource(null);
                    setSourceDetails(null);
                  }}
                  className="p-2 hover:bg-[#F5F5F7] rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-[#86868B]" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg border border-[#D2D2D7]">
                    <div className="text-sm text-[#86868B] mb-1">Total Jobs</div>
                    <div className="text-2xl font-bold text-[#1D1D1F]">{sourceDetails.total_jobs}</div>
                  </div>
                  <div className="p-4 rounded-lg border border-[#D2D2D7]">
                    <div className="text-sm text-[#86868B] mb-1">Unique URLs</div>
                    <div className="text-2xl font-bold text-[#1D1D1F]">{sourceDetails.unique_urls}</div>
                  </div>
                  <div className="p-4 rounded-lg border border-red-200 bg-red-50">
                    <div className="text-sm text-red-600 mb-1">Null URLs</div>
                    <div className="text-2xl font-bold text-red-600">{sourceDetails.null_urls}</div>
                  </div>
                  <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50">
                    <div className="text-sm text-yellow-600 mb-1">Listing URLs</div>
                    <div className="text-2xl font-bold text-yellow-600">{sourceDetails.listing_page_urls}</div>
                  </div>
                </div>

                {sourceDetails.duplicate_urls.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-[#1D1D1F] mb-3">Duplicate URLs</h3>
                    <div className="space-y-2">
                      {sourceDetails.duplicate_urls.map((dup, idx) => (
                        <div key={idx} className="p-3 rounded-lg border border-orange-200 bg-orange-50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-orange-900">
                              {dup.url.substring(0, 80)}...
                            </span>
                            <span className="text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded">
                              Used {dup.count} times
                            </span>
                          </div>
                          <div className="text-xs text-orange-700 mt-1">
                            Jobs: {dup.titles.slice(0, 3).join(', ')}
                            {dup.titles.length > 3 && ` +${dup.titles.length - 3} more`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

