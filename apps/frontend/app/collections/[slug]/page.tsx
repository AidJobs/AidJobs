'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Briefcase, Star, Bookmark } from 'lucide-react';
import JobInspector from '@/components/JobInspector';
import SavedJobsPanel from '@/components/SavedJobsPanel';
import CollectionsNav from '@/components/CollectionsNav';
import CollectionsPopover from '@/components/CollectionsPopover';
import { getShortlist, toggleShortlist, isInShortlist } from '@/lib/shortlist';
import { getCollection } from '@/lib/collections';
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
  
  const [facets, setFacets] = useState<Record<string, any>>({});
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const facetsCacheRef = useRef<{ data: FacetsResponse['facets']; timestamp: number } | null>(null);
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

  const buildSearchQuery = useCallback((pageNum: number) => {
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
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const visibleCountries = showAllCountries ? countryEntries : countryEntries.slice(0, 8);

  const levelEntries = Object.entries(facets.level_norm || {});

  const missionTagEntries = Object.entries(facets.mission_tags || {})
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const visibleMissionTags = showAllTags ? missionTagEntries : missionTagEntries.slice(0, 12);

  const internationalCount = facets?.international_eligible?.['true'] || 0;

  const filtersSlot = (
    <>
      <CollectionsPopover />
      
      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Country</h3>
        {facetsLoading ? (
          <Skeleton className="h-8" />
        ) : visibleCountries.length > 0 ? (
          <div className="space-y-1">
            <Button
              onClick={() => setCountry('')}
              variant={country === '' ? 'default' : 'ghost'}
              size="sm"
              className="w-full justify-between"
            >
              <span>All</span>
            </Button>
            {visibleCountries.map(([iso, count]) => (
              <Button
                key={iso}
                onClick={() => setCountry(iso)}
                variant={country === iso ? 'default' : 'ghost'}
                size="sm"
                className="w-full justify-between"
              >
                <span className="truncate">{iso}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </Button>
            ))}
            {countryEntries.length > 8 && (
              <Button
                onClick={() => setShowAllCountries(!showAllCountries)}
                variant="link"
                size="sm"
                className="w-full"
              >
                {showAllCountries ? 'Show less...' : `More... (${countryEntries.length - 8} more)`}
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
            {levelEntries.map(([lvl, count]) => (
              <FilterChip
                key={lvl}
                selected={level === lvl}
                onClick={() => setLevel(lvl)}
              >
                <span className="capitalize">{lvl}</span>
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">{collection.title}</h1>
        <p className="text-sm text-muted-foreground">{collection.description}</p>
      </div>

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
                  </div>
                </div>
                <Skeleton className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery || country || level || missionTags.length > 0
            ? 'No jobs found matching your criteria'
            : 'Loading jobs...'}
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm font-medium text-foreground">
            {total} role{total !== 1 ? 's' : ''}
          </div>
          
          <div className="space-y-3 mb-6">
            {results.map((job) => {
              const jobIsShortlisted = isInShortlist(job.id);
              const isClosingSoon = job.deadline 
                ? new Date(job.deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 
                : false;
              
              return (
              <div
                key={job.id}
                onClick={() => {
                  setPreviouslyFocusedElement(document.activeElement as HTMLElement);
                  setSelectedJob(job);
                }}
                className="bg-surface border border-border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer focus-visible:ring-2 focus-visible:ring-ring"
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
          onChange={(e) => setSearchQuery(e.target.value)}
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
