'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import JobInspector from '@/components/JobInspector';
import SavedJobsPanel from '@/components/SavedJobsPanel';
import Toast from '@/components/Toast';
import CollectionsNav from '@/components/CollectionsNav';
import { getShortlist, toggleShortlist, isInShortlist } from '@/lib/shortlist';
import { getCollection } from '@/lib/collections';
import Link from 'next/link';

type Capabilities = {
  search: boolean;
  cv: boolean;
  payments: boolean;
  findearn: boolean;
};

type Job = {
  id: string;
  org_name: string;
  title: string;
  location_raw?: string;
  country?: string;
  level_norm?: string;
  deadline?: string;
  apply_url?: string;
  last_seen_at?: string;
  mission_tags?: string[];
  international_eligible?: boolean;
  reasons?: string[];
};

type SearchResponse = {
  status: string;
  data: {
    items: Job[];
    total: number;
    page: number;
    size: number;
    source?: string;
  };
  error: null | string;
  request_id: string;
};

type FacetsResponse = {
  enabled: boolean;
  facets: {
    country: Record<string, number>;
    level_norm: Record<string, number>;
    mission_tags: Record<string, number>;
    international_eligible: Record<string, number>;
  };
};

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  
  const collection = getCollection(slug);
  
  if (!collection) {
    router.push('/');
    return null;
  }

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [country, setCountry] = useState(searchParams.get('country') || '');
  const [level, setLevel] = useState(searchParams.get('level_norm') || '');
  const [international, setInternational] = useState(searchParams.get('international_eligible') === 'true');
  const [missionTags, setMissionTags] = useState<string[]>(
    searchParams.getAll('mission_tags') || []
  );
  const [results, setResults] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchSource, setSearchSource] = useState<string>('');
  const [shortlistedIds, setShortlistedIds] = useState<string[]>([]);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  
  const [facets, setFacets] = useState<Record<string, any>>({});
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const facetsCacheRef = useRef<{ data: FacetsResponse['facets']; timestamp: number } | null>(null);

  useEffect(() => {
    setShortlistedIds(getShortlist());
  }, []);

  const handleToggleShortlist = useCallback((jobId: string) => {
    const isNowShortlisted = toggleShortlist(jobId);
    setShortlistedIds(getShortlist());
    
    if (isNowShortlisted) {
      setToastMessage('Added to saved jobs');
      setToastType('success');
    } else {
      setToastMessage('Removed from saved jobs');
      setToastType('info');
    }
  }, []);

  useEffect(() => {
    fetch('/api/capabilities')
      .then((res) => res.json())
      .then((data) => {
        setCapabilities(data);
        setLoading(false);
      })
      .catch(() => {
        setCapabilities({ search: false, cv: false, payments: false, findearn: false });
        setLoading(false);
      });
  }, []);

  const fetchFacets = useCallback(async () => {
    const now = Date.now();
    if (facetsCacheRef.current && now - facetsCacheRef.current.timestamp < 30000) {
      setFacets(facetsCacheRef.current.data);
      setFacetsLoading(false);
      return;
    }

    setFacetsLoading(true);
    try {
      const res = await fetch('/api/search/facets');
      const data: FacetsResponse = await res.json();
      const newFacets = data.enabled ? data.facets : {};
      setFacets(newFacets || {});
      facetsCacheRef.current = { data: newFacets || {}, timestamp: now };
    } catch (error) {
      setFacets({});
    } finally {
      setFacetsLoading(false);
    }
  }, []);

  const buildSearchQuery = useCallback((pageNum: number, additionalFilters: Record<string, any> = {}) => {
    const params = new URLSearchParams();
    
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (country) params.set('country', country);
    if (level) params.set('level_norm', level);
    if (international) params.set('international_eligible', 'true');
    
    missionTags.forEach(tag => params.append('mission_tags', tag));
    
    Object.entries(collection.filters).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        params.set(key, String(value));
      } else if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else {
        params.set(key, String(value));
      }
    });
    
    Object.entries(additionalFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });
    
    params.set('page', String(pageNum));
    params.set('size', '20');
    
    return params.toString();
  }, [searchQuery, country, level, international, missionTags, collection.filters]);

  const performSearch = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    setSearching(true);
    
    try {
      const queryString = buildSearchQuery(pageNum);
      const res = await fetch(`/api/search/query?${queryString}`);
      const data: SearchResponse = await res.json();
      
      if (data.status === 'ok' && data.data) {
        if (append) {
          setResults(prev => [...prev, ...data.data.items]);
        } else {
          setResults(data.data.items);
        }
        setTotal(data.data.total);
        setPage(data.data.page);
        setSearchSource(data.data.source || '');
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  }, [buildSearchQuery]);

  useEffect(() => {
    fetchFacets();
  }, [fetchFacets]);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      performSearch(1, false);
    }, 250);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, country, level, international, missionTags, performSearch]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleLoadMore = () => {
    performSearch(page + 1, true);
  };

  const toggleMissionTag = (tag: string) => {
    setMissionTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const countryEntries = Object.entries(facets.country || {})
    .sort(([, a], [, b]) => b - a);
  const visibleCountries = showAllCountries ? countryEntries : countryEntries.slice(0, 8);

  const missionTagEntries = Object.entries(facets.mission_tags || {})
    .sort(([, a], [, b]) => b - a);
  const visibleMissionTags = showAllTags ? missionTagEntries : missionTagEntries.slice(0, 12);

  return (
    <>
      <CollectionsNav />
      <main className="min-h-screen bg-gray-50 pl-56">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{collection.title}</h1>
              <p className="text-sm text-gray-600">{collection.description}</p>
            </div>
          
          <SavedJobsPanel
            shortlistedIds={shortlistedIds}
            isOpen={showSavedPanel}
            onToggle={() => setShowSavedPanel(!showSavedPanel)}
            onJobClick={(jobId) => {
              const job = results.find(j => j.id === jobId);
              if (job) {
                setSelectedJob(job);
                setShowSavedPanel(false);
              }
            }}
          />
        </div>

        <div className="mb-6">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roles, orgs, or skills... (Press / to focus)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {!capabilities?.search && searchSource !== 'meili' && (
          <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            Search is running in {searchSource === 'db' ? 'database fallback' : 'limited'} mode
          </div>
        )}

        <div className="flex gap-6">
          <div className="w-64 flex-shrink-0 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Country</h3>
              {facetsLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : visibleCountries.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All countries</option>
                    {visibleCountries.map(([iso, count]) => (
                      <option key={iso} value={iso}>
                        {iso} ({count})
                      </option>
                    ))}
                  </select>
                  {countryEntries.length > 8 && (
                    <button
                      onClick={() => setShowAllCountries(!showAllCountries)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {showAllCountries ? 'Show less...' : `More... (${countryEntries.length - 8} more)`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No data</div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Level</h3>
              {facetsLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : Object.keys(facets.level_norm || {}).length > 0 ? (
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All levels</option>
                  {Object.entries(facets.level_norm).map(([lvl, count]) => (
                    <option key={lvl} value={lvl}>
                      {lvl} ({count})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500">No data</div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">International</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={international}
                  onChange={(e) => setInternational(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">International eligible</span>
              </label>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Mission Tags</h3>
              {facetsLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : visibleMissionTags.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {visibleMissionTags.map(([tag, count]) => (
                      <button
                        key={tag}
                        onClick={() => toggleMissionTag(tag)}
                        className={`px-3 py-1 rounded-full text-xs transition-colors ${
                          missionTags.includes(tag)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <span>{tag}</span>
                        <span className="ml-1.5 opacity-75">({count})</span>
                      </button>
                    ))}
                  </div>
                  {missionTagEntries.length > 12 && (
                    <button
                      onClick={() => setShowAllTags(!showAllTags)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {showAllTags ? 'Show less...' : `More... (${missionTagEntries.length - 12} more)`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No data</div>
              )}
            </div>
          </div>

          <div className="flex-1">
            {searching && page === 1 ? (
              <div className="text-center py-12 text-gray-500">Searching...</div>
            ) : results.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchQuery || country || level || missionTags.length > 0
                  ? 'No jobs found matching your criteria'
                  : 'Loading jobs...'}
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm font-medium text-gray-700">
                  {total} role{total !== 1 ? 's' : ''}
                </div>
                
                <div className="space-y-2 mb-6">
                  {results.map((job) => {
                    const jobIsShortlisted = isInShortlist(job.id);
                    const isClosingSoon = job.deadline 
                      ? new Date(job.deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 
                      : false;
                    
                    return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer focus-within:ring-2 focus-within:ring-blue-500"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedJob(job);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {job.title}
                            </h3>
                            {isClosingSoon && (
                              <span className="px-2 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 rounded flex-shrink-0">
                                Closing soon
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{job.org_name}</p>
                          {job.reasons && job.reasons.length > 0 && (
                            <div className="flex gap-1.5 mb-1">
                              {job.reasons.map((reason, idx) => (
                                <span 
                                  key={idx}
                                  className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-gray-500">
                            {(job.location_raw || job.country) && (
                              <span>{job.location_raw || job.country}</span>
                            )}
                            {job.level_norm && (
                              <span className="capitalize">{job.level_norm}</span>
                            )}
                            {job.deadline && (
                              <span>Deadline: {new Date(job.deadline).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleShortlist(job.id);
                          }}
                          className="p-2 hover:bg-gray-50 rounded transition-colors flex-shrink-0"
                          aria-label={jobIsShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                          title={jobIsShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                        >
                          <svg 
                            className={`w-5 h-5 ${jobIsShortlisted ? 'fill-yellow-500 stroke-yellow-600' : 'fill-none stroke-gray-400'}`}
                            viewBox="0 0 24 24" 
                            strokeWidth="2"
                          >
                            <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>

                {results.length < total && (
                  <button
                    onClick={handleLoadMore}
                    disabled={searching}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {searching ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      </div>

        <JobInspector
          job={selectedJob}
          isOpen={!!selectedJob}
          onClose={() => setSelectedJob(null)}
          onToggleShortlist={handleToggleShortlist}
          isShortlisted={selectedJob ? isInShortlist(selectedJob.id) : false}
        />

        {toastMessage && (
          <Toast
            message={toastMessage}
            type={toastType}
            onClose={() => setToastMessage(null)}
          />
        )}
      </main>
    </>
  );
}
