'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import JobInspector from '@/components/JobInspector';
import CollectionsNav from '@/components/CollectionsNav';
import { getShortlist, removeFromShortlist, isInShortlist } from '@/lib/shortlist';
import { Button, Badge, IconButton, Skeleton, toast } from '@aidjobs/ui';

type Job = {
  id: string;
  org_name: string;
  title: string;
  location_raw?: string;
  country?: string;
  country_iso?: string;
  level_norm?: string;
  deadline?: string;
  apply_url?: string;
  last_seen_at?: string;
  mission_tags?: string[];
  international_eligible?: boolean;
  benefits?: string[];
  policy_flags?: string[];
  career_type?: string;
  work_modality?: string;
  org_type?: string;
  description_snippet?: string;
};

export default function SavedPage() {
  const router = useRouter();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [previouslyFocusedElement, setPreviouslyFocusedElement] = useState<HTMLElement | null>(null);
  const scrollPositionRef = useRef(0);

  useEffect(() => {
    const ids = getShortlist();
    setSavedIds(ids);

    if (ids.length === 0) {
      setLoading(false);
      return;
    }

    const fetchJobs = async () => {
      const jobMap = new Map<string, Job>();
      
      await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(`/api/jobs/${id}`);
            if (response.ok) {
              const data = await response.json();
              jobMap.set(id, data);
            }
          } catch (error) {
            console.error(`Failed to fetch job ${id}:`, error);
          }
        })
      );

      setJobs(jobMap);
      setLoading(false);
    };

    fetchJobs();
  }, []);

  const handleRemove = useCallback((jobId: string) => {
    removeFromShortlist(jobId);
    setSavedIds(getShortlist());
    setJobs((prev) => {
      const updated = new Map(prev);
      updated.delete(jobId);
      return updated;
    });
    toast.info('Removed from saved jobs');
    
    if (selectedJob?.id === jobId) {
      setSelectedJob(null);
    }
  }, [selectedJob]);

  const handleOpenJob = useCallback((job: Job, element: HTMLElement | null) => {
    scrollPositionRef.current = window.scrollY;
    setPreviouslyFocusedElement(element);
    setSelectedJob(job);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedJob(null);
    
    setTimeout(() => {
      window.scrollTo(0, scrollPositionRef.current);
      if (previouslyFocusedElement) {
        previouslyFocusedElement.focus();
      }
    }, 0);
  }, [previouslyFocusedElement]);

  const isClosingSoon = (deadline?: string) => {
    if (!deadline) return false;
    const daysUntil = Math.ceil(
      (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil >= 0 && daysUntil < 7;
  };

  return (
    <div className="min-h-screen bg-background">
      <CollectionsNav />
      
      <div className="ml-56 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground">Saved Jobs</h1>
            <p className="text-muted-foreground mt-2">
              {savedIds.length} {savedIds.length === 1 ? 'role' : 'roles'} saved for later
            </p>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-surface border border-border rounded-lg p-4">
                  <Skeleton className="h-5 w-3/4 mb-3" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          ) : savedIds.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg p-12 text-center">
              <svg className="w-16 h-16 text-muted-foreground mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              <h2 className="text-xl font-semibold text-foreground mb-2">No saved jobs yet</h2>
              <p className="text-muted-foreground mb-6">
                Start saving jobs you're interested in to easily find them later
              </p>
              <Button
                onClick={() => router.push('/')}
                variant="primary"
                size="md"
              >
                Go to search
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {savedIds.map((id) => {
                const job = jobs.get(id);
                
                if (!job) {
                  return (
                    <div key={id} className="bg-surface border border-border rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">Job no longer available</p>
                    </div>
                  );
                }

                const location = job.country || job.location_raw || 'Location not specified';
                const ariaLabel = `${job.title} at ${job.org_name}, ${location}`;
                
                return (
                  <div
                    key={job.id}
                    className="bg-surface border border-border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <Button
                        onClick={(e) => handleOpenJob(job, e.currentTarget as HTMLElement)}
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-auto flex-col items-start px-0 py-0 text-left"
                        aria-label={ariaLabel}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="text-base font-semibold text-foreground group-hover:text-primary">
                                {job.title}
                              </h3>
                              {isClosingSoon(job.deadline) && (
                                <Badge variant="warning">Closing soon</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">{job.org_name}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {job.country && <span>{job.country}</span>}
                              {job.level_norm && (
                                <>
                                  <span className="text-muted-foreground/40">•</span>
                                  <span className="capitalize">{job.level_norm}</span>
                                </>
                              )}
                              {job.deadline && (
                                <>
                                  <span className="text-muted-foreground/40">•</span>
                                  <span>Due {new Date(job.deadline).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </Button>
                      
                      <IconButton
                        onClick={() => handleRemove(job.id)}
                        variant="ghost"
                        size="sm"
                        icon={Star}
                        className="text-warning fill-warning hover:text-muted-foreground hover:fill-none"
                        aria-label="Remove from saved"
                        title="Remove from saved"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedJob && (
        <JobInspector
          job={selectedJob}
          isOpen={true}
          onClose={handleCloseInspector}
          onToggleShortlist={handleRemove}
          isShortlisted={isInShortlist(selectedJob.id)}
          previouslyFocusedElement={previouslyFocusedElement}
        />
      )}
    </div>
  );
}
