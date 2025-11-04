'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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
  
  const [facets, setFacets] = useState<Record<string, any>>({});
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const facetsCacheRef = useRef<{ data: FacetsResponse['facets']; timestamp: number } | null>(null);

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
    if (country) params.set('country', country);
    if (level) params.set('level_norm', level);
    if (international) params.set('international_eligible', 'true');
    missionTags.forEach(tag => params.append('mission_tags', tag));
    
    const newQuery = params.toString();
    const currentQuery = searchParams.toString();
    
    if (newQuery !== currentQuery) {
      router.replace(newQuery ? `?${newQuery}` : '/', { scroll: false });
    }
  }, [searchQuery, country, level, international, missionTags, router, searchParams]);

  const performSearch = useCallback(async (searchPage: number = 1, append: boolean = false) => {
    setSearching(true);
    
    const params = new URLSearchParams();
    if (searchQuery) params.append('q', searchQuery);
    params.append('page', searchPage.toString());
    params.append('size', '20');
    if (country) params.append('country', country);
    if (level) params.append('level_norm', level);
    if (international) params.append('international_eligible', 'true');
    missionTags.forEach(tag => params.append('mission_tags', tag));

    try {
      const response = await fetch(`/api/search/query?${params.toString()}`);
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
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, country, level, international, missionTags, fetchFacets]);

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
  }, [country, level, international, missionTags, handleFilterChange]);

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

  const showSearchBanner = !loading && capabilities && (!capabilities.search || searchSource === 'db');
  const searchBannerText = searchSource === 'db'
    ? 'Search running in fallback mode (database)'
    : 'Search temporarily unavailable';

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
    <main className="min-h-screen bg-gray-50">
      {showSearchBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">{searchBannerText}</p>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-6">AidJobs</h1>
          
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
                  {results.map((job) => (
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
                          <h3 className="font-semibold text-gray-900 truncate mb-1">
                            {job.title}
                          </h3>
                          <p className="text-sm text-gray-600 mb-1">{job.org_name}</p>
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
                          }}
                          className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ))}
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

          {selectedJob && (
            <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 overflow-y-auto z-50">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Job Details</h2>
                  <button
                    onClick={() => setSelectedJob(null)}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
                    aria-label="Close inspector"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 mb-1">
                      {selectedJob.title}
                    </h3>
                    <p className="text-gray-600">{selectedJob.org_name}</p>
                  </div>

                  {(selectedJob.location_raw || selectedJob.country) && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Location</dt>
                      <dd className="text-gray-900">{selectedJob.location_raw || selectedJob.country}</dd>
                    </div>
                  )}

                  {selectedJob.level_norm && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Level</dt>
                      <dd className="text-gray-900 capitalize">{selectedJob.level_norm}</dd>
                    </div>
                  )}

                  {selectedJob.mission_tags && selectedJob.mission_tags.length > 0 && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Mission Tags</dt>
                      <dd className="flex flex-wrap gap-2">
                        {selectedJob.mission_tags.map(tag => (
                          <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {tag}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}

                  {selectedJob.international_eligible && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">International</dt>
                      <dd className="text-gray-900">
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          International eligible
                        </span>
                      </dd>
                    </div>
                  )}

                  {selectedJob.deadline && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-1">Deadline</dt>
                      <dd className="text-gray-900">
                        {new Date(selectedJob.deadline).toLocaleDateString()}
                      </dd>
                    </div>
                  )}

                  {selectedJob.apply_url && (
                    <div className="pt-4">
                      <a
                        href={selectedJob.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full px-4 py-3 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Apply Now
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedJob && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-40"
          onClick={() => setSelectedJob(null)}
        />
      )}
    </main>
  );
}
