"use client";

import { useEffect, useState } from "react";
import { Sheet, Button, IconButton, Badge, Skeleton } from "@aidjobs/ui";
import { X, ExternalLink, Star } from "lucide-react";

type Job = {
  id: string;
  org_name: string;
  title: string;
  location_raw?: string;
  country?: string;
  country_iso?: string;
  level_norm?: string;
  career_type?: string;
  work_modality?: string;
  org_type?: string;
  international_eligible?: boolean;
  deadline?: string;
  apply_url?: string;
  last_seen_at?: string;
  mission_tags?: string[];
  benefits?: string[];
  policy_flags?: string[];
  description_snippet?: string;
};

type JobInspectorProps = {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleShortlist?: (jobId: string) => void;
  isShortlisted?: boolean;
  previouslyFocusedElement?: HTMLElement | null;
};

export default function JobInspector({
  job,
  isOpen,
  onClose,
  onToggleShortlist,
  isShortlisted = false,
  previouslyFocusedElement = null,
}: JobInspectorProps) {
  const [fullJob, setFullJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    if (!isOpen || !job) {
      setFullJob(null);
      setIsLoading(false);
      setIsNotFound(false);
      return;
    }

    const needsFullDetails =
      !job.benefits ||
      !job.policy_flags ||
      !job.career_type ||
      !job.work_modality ||
      !job.org_type ||
      !job.description_snippet;

    if (needsFullDetails) {
      setIsLoading(true);
      fetch(`/api/jobs/${job.id}`)
        .then(async (res) => {
          if (res.status === 404) {
            setIsNotFound(true);
            setIsLoading(false);
            setTimeout(() => {
              onClose();
            }, 3000);
            return;
          }
          if (!res.ok) throw new Error("Failed to fetch job details");
          const data = await res.json();
          setFullJob(data.data || job);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("Error fetching job details:", error);
          setFullJob(job);
          setIsLoading(false);
        });
    } else {
      setFullJob(job);
      setIsLoading(false);
    }
  }, [isOpen, job, onClose]);

  if (!isOpen || !job) return null;

  const displayJob = fullJob || job;
  const isClosingSoon = displayJob.deadline
    ? new Date(displayJob.deadline).getTime() - Date.now() <
      7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Job Details"
      previouslyFocusedElement={previouslyFocusedElement}
      actions={
        <>
          {onToggleShortlist && !isNotFound && (
            <IconButton
              onClick={() => onToggleShortlist(job.id)}
              variant="ghost"
              size="md"
              icon={Star}
              className={isShortlisted ? "text-warning fill-warning" : ""}
              aria-label={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
              title={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
              disabled={isLoading}
            />
          )}
          <IconButton
            onClick={onClose}
            variant="ghost"
            size="md"
            icon={X}
            aria-label="Close inspector"
          />
        </>
      }
    >
      {isNotFound ? (
        <div className="flex flex-col items-center justify-center h-96">
          <svg
            className="w-16 h-16 text-muted-foreground mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            This role is no longer available
          </h3>
          <p className="text-sm text-muted-foreground">Closing automatically...</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-6 w-1/2" />
          </div>
          <div>
            <Skeleton className="h-4 w-1/4 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">
              {displayJob.title}
            </h3>
            <p className="text-lg text-muted-foreground">{displayJob.org_name}</p>
          </div>

          {displayJob.description_snippet && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                Description
              </h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {displayJob.description_snippet}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {displayJob.location_raw && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Location
                </h4>
                <p className="text-sm text-foreground">
                  {displayJob.location_raw}
                </p>
              </div>
            )}

            {displayJob.country_iso && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Country
                </h4>
                <p className="text-sm text-foreground">
                  {displayJob.country_iso}
                </p>
              </div>
            )}

            {displayJob.level_norm && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Level
                </h4>
                <p className="text-sm text-foreground capitalize">
                  {displayJob.level_norm.replace("_", " ")}
                </p>
              </div>
            )}

            {displayJob.career_type && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Career Type
                </h4>
                <p className="text-sm text-foreground capitalize">
                  {displayJob.career_type.replace("_", " ")}
                </p>
              </div>
            )}

            {displayJob.work_modality && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Work Modality
                </h4>
                <p className="text-sm text-foreground capitalize">
                  {displayJob.work_modality.replace("_", " ")}
                </p>
              </div>
            )}

            {displayJob.org_type && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Organization Type
                </h4>
                <p className="text-sm text-foreground capitalize">
                  {displayJob.org_type.replace("_", " ")}
                </p>
              </div>
            )}

            {displayJob.international_eligible !== undefined && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  International Eligible
                </h4>
                <p className="text-sm text-foreground">
                  {displayJob.international_eligible ? "Yes" : "No"}
                </p>
              </div>
            )}

            {displayJob.deadline && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Deadline
                </h4>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground">
                    {new Date(displayJob.deadline).toLocaleDateString()}
                  </p>
                  {isClosingSoon && (
                    <Badge variant="warning">Closing soon</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {displayJob.mission_tags && displayJob.mission_tags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                Mission Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {displayJob.mission_tags.map((tag, idx) => (
                  <Badge key={idx} variant="info">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {displayJob.benefits && displayJob.benefits.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                Benefits
              </h4>
              <div className="flex flex-wrap gap-2">
                {displayJob.benefits.map((benefit, idx) => (
                  <Badge key={idx} variant="success">
                    {benefit}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {displayJob.policy_flags && displayJob.policy_flags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                Policy Flags
              </h4>
              <div className="flex flex-wrap gap-2">
                {displayJob.policy_flags.map((flag, idx) => (
                  <Badge key={idx} variant="secondary">
                    {flag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {displayJob.apply_url && (
            <div className="pt-4 border-t border-border">
              <Button
                as="a"
                href={displayJob.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                variant="primary"
                size="md"
                className="inline-flex items-center gap-2"
              >
                Apply Now
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
