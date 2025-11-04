'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import JobInspector from '@/components/JobInspector';
import SavedJobsPanel from '@/components/SavedJobsPanel';
import Toast from '@/components/Toast';
import CollectionsNav from '@/components/CollectionsNav';
import { getShortlist, toggleShortlist, isInShortlist } from '@/lib/shortlist';

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

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
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
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'relevance');
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const [previouslyFocusedElement, setPreviouslyFocusedElement] = useState<HTMLElement | null>(null);

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
      const response = await fetch('/api/search/facets');
      const data: FacetsResponse = await response.json();
      
      const facetsData = data?.facets ?? {
        country: {},
        level_norm: {},
        mission_tags: {},
        international_eligible: {},
      };
      
      setFacets(facetsData);
      if (data.enabled && data.facets) {
        facetsCacheRef.current = { data: facetsData, timestamp: now };
      }
    } catch (error) {
      console.error('Facets error:', error);
      setFacets({
        country: {},
        level_norm: {},
        mission_tags: {},
        international_eligible: {},
      });
    } finally {
      setFacetsLoading(false);
    }
  }, []);

  const updateURLParams = useCallback(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (sortBy && sortBy !== 'relevance') params.set('sort', sortBy);
    if (country) params.set('country', country);
    if (level) params.set('level_norm', level);
    if (international) params.set('international_eligible', 'true');
    missionTags.forEach(tag => params.append('mission_tags', tag));
    
    const newQuery = params.toString();
    const currentQuery = searchParams.toString();
    
    if (newQuery !== currentQuery) {
      router.replace(newQuery ? `?${newQuery}` : '/', { scroll: false });
    }
  }, [searchQuery, sortBy, country, level, international, missionTags, router, searchParams]);

  const performSearch = useCallback(async (searchPage: number = 1, append: boolean = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setSearching(true);
    
    const params = new URLSearchParams();
    if (searchQuery) params.append('q', searchQuery);
    params.append('page', searchPage.toString());
    params.append('size', '20');
    if (sortBy && sortBy !== 'relevance') params.append('sort', sortBy);
    if (country) params.append('country', country);
    if (level) params.append('level_norm', level);
    if (international) params.append('international_eligible', 'true');
    missionTags.forEach(tag => params.append('mission_tags', tag));

    try {
      const response = await fetch(`/api/search/query?${params.toString()}`, {
        signal: abortControllerRef.current.signal,
      });
      const data: SearchResponse = await response.json();
      
      if (append) {
        setResults(prev => [...prev, ...data.data.items]);
      } else {
        setResults(data.data.items);
      }
      
      setTotal(data.data.total);
      setPage(searchPage);
      setSearchSource(data.data.source || '');
      
      if (searchPage === 1) {
        fetchFacets();
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Search error:', error);
        setResults([]);
        setTotal(0);
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery, sortBy, country, level, international, missionTags, fetchFacets]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setPage(1);
      performSearch(1, false);
    }, 250);
  };

  const handleFilterChange = useCallback(() => {
    setPage(1);
    updateURLParams();
    performSearch(1, false);
  }, [performSearch, updateURLParams]);

  useEffect(() => {
    handleFilterChange();
  }, [country, level, international, missionTags, sortBy, handleFilterChange]);

  useEffect(() => {
    fetchFacets();
    performSearch(1, false);
  }, []);

  const handleLoadMore = () => {
    performSearch(page + 1, true);
  };

  const toggleMissionTag = (tag: string) => {
    setMissionTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setCountry('');
    setLevel('');
    setInternational(false);
    setMissionTags([]);
    setSearchQuery('');
    setSortBy('relevance');
  };

  const retrySearch = async () => {
    setToastMessage('Retrying search...');
    setToastType('info');
    await new Promise(resolve => setTimeout(resolve, 2000));
    performSearch(1, false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      if (e.key === 'Escape') {
        if (selectedJob) {
          setSelectedJob(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedJob]);

  const showFallbackBanner = !loading && searchSource === 'db';
  const hasAnyFilters = searchQuery || country || level || international || missionTags.length > 0;

  const f = facets ?? {};
  const countryMap = (f as any).country ?? {};
  const levelMap = (f as any).level_norm ?? {};
  const tagsMap = (f as any).mission_tags ?? {};
  const intlMap = (f as any).international_eligible ?? {};

  const countryEntries = Object.entries(countryMap).sort((a, b) => (b[1] as number) - (a[1] as number));
  const visibleCountries = showAllCountries ? countryEntries : countryEntries.slice(0, 10);
  const levelEntries = Object.entries(levelMap);
  const tagEntries = Object.entries(tagsMap);
  const intlEntries = Object.entries(intlMap);
  
  const missionTagEntries = tagEntries.sort((a, b) => (b[1] as number) - (a[1] as number));
  const visibleMissionTags = showAllTags ? missionTagEntries : missionTagEntries.slice(0, 12);
  
  const internationalCount = intlMap?.['true'] || 0;

  return (
    <>
      <CollectionsNav />
      <main className="min-h-screen bg-gray-50 pl-56">
        {showFallbackBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <p className="text-sm text-amber-800">Running on backup search (temporarily)</p>
              <button
                onClick={retrySearch}
                className="text-sm text-amber-900 hover:text-amber-950 font-medium underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold">All Jobs</h1>
              <div className="relative">
              <button
                onClick={() => setShowSavedPanel(!showSavedPanel)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">Saved</span>
                {shortlistedIds.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-semibold text-white bg-blue-600 rounded-full">
                    {shortlistedIds.length}
                  </span>
                )}
              </button>
              <SavedJobsPanel
                isOpen={showSavedPanel}
                onClose={() => setShowSavedPanel(false)}
                shortlistedIds={shortlistedIds}
                allJobs={results}
                onOpenJob={(job) => {
                  setPreviouslyFocusedElement(document.activeElement as HTMLElement);
                  setSelectedJob(job);
                }}
                onRemove={handleToggleShortlist}
              />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search roles, orgs, or skills… (Press / to focus)"
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Country</h3>
              {facetsLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : visibleCountries.length > 0 ? (
                <div className="space-y-2">
                  <button
                    onClick={() => setCountry('')}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                      country === ''
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span>All Countries</span>
                    <span className="ml-2 text-xs text-gray-500">{total}</span>
                  </button>
                  {visibleCountries.map(([countryName, count]) => (
                    <button
                      key={countryName}
                      onClick={() => setCountry(countryName)}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors flex justify-between items-center ${
                        country === countryName
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span className="truncate">{countryName}</span>
                      <span className="ml-2 text-xs text-gray-500">{count}</span>
                    </button>
                  ))}
                  {countryEntries.length > 10 && (
                    <button
                      onClick={() => setShowAllCountries(!showAllCountries)}
                      className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700"
                    >
                      {showAllCountries ? 'Show less...' : `More... (${countryEntries.length - 10} more)`}
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
              ) : levelEntries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setLevel('')}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      level === ''
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    All
                  </button>
                  {levelEntries.map(([levelName, count]) => (
                    <button
                      key={levelName}
                      onClick={() => setLevel(levelName)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        level === levelName
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      <span className="capitalize">{levelName}</span>
                      <span className="ml-1.5 text-xs opacity-75">({count})</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No data</div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">International</h3>
              <label className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={international}
                  onChange={(e) => setInternational(e.target.checked)}
                  className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500 rounded"
                />
                <span className="text-sm text-gray-700">International eligible</span>
                {internationalCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                    {internationalCount}
                  </span>
                )}
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
        </div>

        <div className="flex gap-6">
          <div className="flex-1">
            {searching && page === 1 ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                        <div className="flex gap-3">
                          <div className="h-3 bg-gray-200 rounded w-20"></div>
                          <div className="h-3 bg-gray-200 rounded w-16"></div>
                          <div className="h-3 bg-gray-200 rounded w-24"></div>
                        </div>
                      </div>
                      <div className="w-5 h-5 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                {hasAnyFilters ? (
                  <div className="max-w-md mx-auto">
                    <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-xl font-semibold text-gray-900 mb-2">No jobs found</p>
                    <p className="text-gray-600 mb-6">Try adjusting your filters to see more results</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={clearFilters}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Clear all filters
                      </button>
                      {country && (
                        <button
                          onClick={() => setCountry('')}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Remove country
                        </button>
                      )}
                      {level && (
                        <button
                          onClick={() => setLevel('')}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Remove level
                        </button>
                      )}
                      {missionTags.length === 0 && !searchQuery.toLowerCase().includes('remote') && (
                        <button
                          onClick={() => {
                            setSearchQuery('remote');
                            performSearch(1, false);
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Try "remote"
                        </button>
                      )}
                      {missionTags.length > 0 && (
                        <button
                          onClick={() => setMissionTags([])}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Clear mission tags
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Loading jobs...</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-700">
                    {total} role{total !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="sort" className="text-sm text-gray-600">Sort:</label>
                    <select
                      id="sort"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="newest">Newest</option>
                      <option value="closing_soon">Closing soon</option>
                    </select>
                  </div>
                </div>
                
                <div className="space-y-2 mb-6">
                  {results.map((job) => {
                    const jobIsShortlisted = isInShortlist(job.id);
                    const isClosingSoon = job.deadline 
                      ? new Date(job.deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 
                      : false;
                    
                    const location = job.location_raw || job.country || 'Location not specified';
                    const ariaLabel = `${job.title} at ${job.org_name}, ${location}`;
                    
                    return (
                    <div
                      key={job.id}
                      role="button"
                      aria-label={ariaLabel}
                      onClick={(e) => {
                        setPreviouslyFocusedElement(e.currentTarget);
                        setSelectedJob(job);
                      }}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer focus-within:ring-2 focus-within:ring-blue-500"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPreviouslyFocusedElement(e.currentTarget);
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
                          aria-pressed={jobIsShortlisted}
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
        previouslyFocusedElement={previouslyFocusedElement}
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
