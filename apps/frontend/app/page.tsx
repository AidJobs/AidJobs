'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

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
};

type SearchResponse = {
  status: string;
  data: {
    items: Job[];
    total: number;
    page: number;
    size: number;
    fallback?: boolean;
  };
  error: null | string;
  request_id: string;
};

export default function Home() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const [international, setInternational] = useState(false);
  const [missionTags, setMissionTags] = useState<string[]>([]);
  const [results, setResults] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      setFallbackMode(data.data.fallback || false);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, country, level, international, missionTags]);

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
    performSearch(1, false);
  }, [performSearch]);

  useEffect(() => {
    handleFilterChange();
  }, [country, level, international, missionTags, handleFilterChange]);

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

  const showSearchBanner = !loading && capabilities && (!capabilities.search || fallbackMode);
  const searchBannerText = fallbackMode
    ? 'Search running in fallback mode'
    : 'Search temporarily unavailable';

  const availableMissionTags = ['health', 'education', 'environment', 'human-rights', 'development'];

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
              placeholder="Search roles, orgs, or skills…"
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Countries</option>
              <option value="Kenya">Kenya</option>
              <option value="Uganda">Uganda</option>
              <option value="Tanzania">Tanzania</option>
              <option value="Ethiopia">Ethiopia</option>
              <option value="South Africa">South Africa</option>
            </select>

            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Levels</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
            </select>

            <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={international}
                onChange={(e) => setInternational(e.target.checked)}
                className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm">International</span>
            </label>

            <div className="flex flex-wrap gap-2">
              {availableMissionTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleMissionTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    missionTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
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
                  : 'Enter search terms or select filters to find jobs'}
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-gray-600">
                  {total} job{total !== 1 ? 's' : ''} found
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
