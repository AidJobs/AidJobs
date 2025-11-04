'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Briefcase, Star, Bookmark } from 'lucide-react';
import JobInspector from '@/components/JobInspector';
import SavedJobsPanel from '@/components/SavedJobsPanel';
import CollectionsNav from '@/components/CollectionsNav';
import { getShortlist, toggleShortlist, isInShortlist } from '@/lib/shortlist';
import { 
  SearchShell, 
  StatusRail, 
  ThemeToggle, 
  Input, 
  Button, 
  FilterChip, 
  Skeleton,
  Badge,
  IconButton,
  toast
} from '@aidjobs/ui';

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
      toast.success('Added to saved jobs');
    } else {
      toast.info('Removed from saved jobs');
    }
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
    toast.info('Retrying search...');
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

  const showFallbackBanner = searchSource === 'db';
  const hasAnyFilters = searchQuery || country || level || international || missionTags.length > 0;

  const f = facets ?? {};
  const countryMap = (f as any).country ?? {};
  const levelMap = (f as any).level_norm ?? {};
  const tagsMap = (f as any).mission_tags ?? {};
  const intlMap = (f as any).international_eligible ?? {};

  const countryEntries = Object.entries(countryMap).sort((a, b) => (b[1] as number) - (a[1] as number));
  const visibleCountries = showAllCountries ? countryEntries : countryEntries.slice(0, 10);
  const levelEntries = Object.entries(levelMap);
  
  const missionTagEntries = Object.entries(tagsMap).sort((a, b) => (b[1] as number) - (a[1] as number));
  const visibleMissionTags = showAllTags ? missionTagEntries : missionTagEntries.slice(0, 12);
  
  const internationalCount = intlMap?.['true'] || 0;

  const filtersSlot = (
    <>
      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Country</h3>
        {facetsLoading ? (
          <Skeleton className="h-8" />
        ) : visibleCountries.length > 0 ? (
          <div className="space-y-1.5">
            <Button
              onClick={() => setCountry('')}
              variant={country === '' ? 'default' : 'ghost'}
              size="sm"
              className="w-full justify-between"
            >
              <span>All Countries</span>
              <span className="text-xs text-muted-foreground">{total}</span>
            </Button>
            {visibleCountries.map(([countryName, count]) => (
              <Button
                key={countryName}
                onClick={() => setCountry(countryName)}
                variant={country === countryName ? 'default' : 'ghost'}
                size="sm"
                className="w-full justify-between"
              >
                <span className="truncate">{countryName}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </Button>
            ))}
            {countryEntries.length > 10 && (
              <Button
                onClick={() => setShowAllCountries(!showAllCountries)}
                variant="link"
                size="sm"
                className="w-full"
              >
                {showAllCountries ? 'Show less...' : `More... (${countryEntries.length - 10} more)`}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No data</div>
        )}
      </div>

      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Level</h3>
        {facetsLoading ? (
          <Skeleton className="h-8" />
        ) : levelEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <FilterChip
              selected={level === ''}
              onClick={() => setLevel('')}
            >
              All
            </FilterChip>
            {levelEntries.map(([levelName, count]) => (
              <FilterChip
                key={levelName}
                selected={level === levelName}
                onClick={() => setLevel(levelName)}
              >
                <span className="capitalize">{levelName}</span>
                <span className="ml-1.5 text-xs opacity-75">({count})</span>
              </FilterChip>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No data</div>
        )}
      </div>

      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">International</h3>
        <label className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-muted transition-colors">
          <input
            type="checkbox"
            checked={international}
            onChange={(e) => setInternational(e.target.checked)}
            className="w-4 h-4 text-primary focus-visible:ring-2 focus-visible:ring-ring rounded"
          />
          <span className="text-sm text-foreground">International eligible</span>
          {internationalCount > 0 && (
            <Badge variant="default" className="ml-auto">
              {internationalCount}
            </Badge>
          )}
        </label>
      </div>

      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Mission Tags</h3>
        {facetsLoading ? (
          <Skeleton className="h-8" />
        ) : visibleMissionTags.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {visibleMissionTags.map(([tag, count]) => (
                <FilterChip
                  key={tag}
                  selected={missionTags.includes(tag)}
                  onClick={() => toggleMissionTag(tag)}
                >
                  <span>{tag}</span>
                  <span className="ml-1.5 opacity-75">({count})</span>
                </FilterChip>
              ))}
            </div>
            {missionTagEntries.length > 12 && (
              <Button
                onClick={() => setShowAllTags(!showAllTags)}
                variant="link"
                size="sm"
              >
                {showAllTags ? 'Show less...' : `More... (${missionTagEntries.length - 12} more)`}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No data</div>
        )}
      </div>
    </>
  );

  const resultsSlot = (
    <>
      {showFallbackBanner && (
        <div className="bg-warning/20 border border-warning rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground">Running on backup search (temporarily)</p>
            <Button
              onClick={retrySearch}
              variant="link"
              size="sm"
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {searching && page === 1 ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <div className="flex gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12">
          {hasAnyFilters ? (
            <div className="max-w-md mx-auto">
              <svg className="w-16 h-16 text-muted-foreground mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-xl font-semibold text-foreground mb-2">No jobs found</p>
              <p className="text-muted-foreground mb-6">Try adjusting your filters to see more results</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button
                  onClick={clearFilters}
                  variant="primary"
                  size="md"
                >
                  Clear all filters
                </Button>
                {country && (
                  <Button
                    onClick={() => setCountry('')}
                    variant="secondary"
                    size="md"
                  >
                    Remove country
                  </Button>
                )}
                {level && (
                  <Button
                    onClick={() => setLevel('')}
                    variant="secondary"
                    size="md"
                  >
                    Remove level
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Loading jobs...</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-foreground">
              {total} role{total !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-muted-foreground">Sort:</label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1.5 text-sm border border-input bg-background rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="closing_soon">Closing soon</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-3 mb-6">
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
                className="bg-surface border border-border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer focus-visible:ring-2 focus-visible:ring-ring"
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
                      <h3 className="font-semibold text-foreground truncate">
                        {job.title}
                      </h3>
                      {isClosingSoon && (
                        <Badge variant="warning">Closing soon</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{job.org_name}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
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
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleShortlist(job.id);
                    }}
                    variant="ghost"
                    size="sm"
                    icon={Star}
                    className={jobIsShortlisted ? 'text-warning fill-warning' : ''}
                    aria-label={jobIsShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                    title={jobIsShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                  />
                </div>
              </div>
            );
            })}
          </div>

          {results.length < total && (
            <Button
              onClick={handleLoadMore}
              disabled={searching}
              variant="secondary"
              size="lg"
              className="w-full"
            >
              {searching ? 'Loading...' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </>
  );

  const topBarSlot = (
    <StatusRail
      logo={
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground text-sm">AidJobs</span>
        </div>
      }
      search={
        <Input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search roles, orgs, or skills… (Press / to focus)"
          className="w-full"
        />
      }
      actions={
        <>
          <div className="relative">
            <Button
              onClick={() => setShowSavedPanel(!showSavedPanel)}
              variant="secondary"
              size="sm"
              className="flex items-center gap-2"
            >
              <Bookmark className="w-4 h-4" />
              <span>Saved</span>
              {shortlistedIds.length > 0 && (
                <Badge variant="default">
                  {shortlistedIds.length}
                </Badge>
              )}
            </Button>
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
          <ThemeToggle />
        </>
      }
    />
  );

  const inspectorSlot = (
    <JobInspector
      job={selectedJob}
      isOpen={!!selectedJob}
      onClose={() => setSelectedJob(null)}
      onToggleShortlist={handleToggleShortlist}
      isShortlisted={selectedJob ? isInShortlist(selectedJob.id) : false}
      previouslyFocusedElement={previouslyFocusedElement}
    />
  );

  return (
    <>
      <CollectionsNav />
      <div className="pl-56">
        <SearchShell
          topBar={topBarSlot}
          filters={filtersSlot}
          results={resultsSlot}
          inspector={inspectorSlot}
        />
      </div>
    </>
  );
}
