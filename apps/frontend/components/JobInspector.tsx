"use client";

import { useEffect, useRef, useState } from "react";

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
  reasons?: string[];
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [fullJob, setFullJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);

  // Fetch full job details if missing normalized fields
  useEffect(() => {
    if (!isOpen || !job) {
      setFullJob(null);
      setIsLoading(false);
      setIsNotFound(false);
      return;
    }

    // Check if we need to fetch full details (missing any normalized fields)
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
            // Auto-close after 3 seconds
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

  // Focus management
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  // Restore focus on close
  useEffect(() => {
    if (!isOpen && previouslyFocusedElement) {
      previouslyFocusedElement.focus();
    }
  }, [isOpen, previouslyFocusedElement]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    const handleTab = (e: KeyboardEvent) => {
      if (!isOpen || !drawerRef.current || e.key !== "Tab") return;

      const focusableElements = drawerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !job) return null;

  const displayJob = fullJob || job;
  const isClosingSoon = displayJob.deadline
    ? new Date(displayJob.deadline).getTime() - Date.now() <
      7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-title"
        aria-describedby="inspector-description"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2
            id="inspector-title"
            className="text-lg font-semibold text-gray-900"
          >
            Job Details
          </h2>
          <div className="flex items-center gap-2">
            {onToggleShortlist && !isNotFound && (
              <button
                onClick={() => onToggleShortlist(job.id)}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                aria-label={
                  isShortlisted ? "Remove from shortlist" : "Add to shortlist"
                }
                aria-pressed={isShortlisted}
                title={
                  isShortlisted ? "Remove from shortlist" : "Add to shortlist"
                }
                disabled={isLoading}
              >
                <svg
                  className={`w-5 h-5 ${isShortlisted ? "fill-yellow-500 stroke-yellow-600" : "fill-none stroke-gray-400"}`}
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                >
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>
            )}
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Close inspector"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {isNotFound ? (
          <div className="p-6 flex flex-col items-center justify-center h-96">
            <svg
              className="w-16 h-16 text-gray-300 mb-4"
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
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              This role is no longer available
            </h3>
            <p className="text-sm text-gray-500">Closing automatically...</p>
          </div>
        ) : isLoading ? (
          <div className="p-6 space-y-6 animate-pulse">
            <div>
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
            </div>
            <div>
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-1"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {displayJob.title}
              </h3>
              <p id="inspector-description" className="text-lg text-gray-700 mb-2">{displayJob.org_name}</p>
              {displayJob.reasons && displayJob.reasons.length > 0 && (
                <div className="flex gap-2">
                  {displayJob.reasons.map((reason, idx) => (
                    <span 
                      key={idx}
                      className="px-2.5 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-md"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {displayJob.description_snippet && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Description
                </h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {displayJob.description_snippet}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {displayJob.location_raw && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Location
                  </h4>
                  <p className="text-sm text-gray-900">
                    {displayJob.location_raw}
                  </p>
                </div>
              )}

              {displayJob.country_iso && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Country
                  </h4>
                  <p className="text-sm text-gray-900">
                    {displayJob.country_iso}
                  </p>
                </div>
              )}

              {displayJob.level_norm && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Level
                  </h4>
                  <p className="text-sm text-gray-900 capitalize">
                    {displayJob.level_norm.replace("_", " ")}
                  </p>
                </div>
              )}

              {displayJob.career_type && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Career Type
                  </h4>
                  <p className="text-sm text-gray-900 capitalize">
                    {displayJob.career_type.replace("_", " ")}
                  </p>
                </div>
              )}

              {displayJob.work_modality && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Work Modality
                  </h4>
                  <p className="text-sm text-gray-900 capitalize">
                    {displayJob.work_modality.replace("_", " ")}
                  </p>
                </div>
              )}

              {displayJob.org_type && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Organization Type
                  </h4>
                  <p className="text-sm text-gray-900 capitalize">
                    {displayJob.org_type.replace("_", " ")}
                  </p>
                </div>
              )}

              {displayJob.international_eligible !== undefined && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    International Eligible
                  </h4>
                  <p className="text-sm text-gray-900">
                    {displayJob.international_eligible ? "Yes" : "No"}
                  </p>
                </div>
              )}

              {displayJob.deadline && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">
                    Deadline
                  </h4>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900">
                      {new Date(displayJob.deadline).toLocaleDateString()}
                    </p>
                    {isClosingSoon && (
                      <span className="px-2 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 rounded">
                        Closing soon
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {displayJob.mission_tags && displayJob.mission_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">
                  Mission Tags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {displayJob.mission_tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded border border-blue-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {displayJob.benefits && displayJob.benefits.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">
                  Benefits
                </h4>
                <div className="flex flex-wrap gap-2">
                  {displayJob.benefits.map((benefit, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded border border-green-200"
                    >
                      {benefit}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {displayJob.policy_flags && displayJob.policy_flags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">
                  Policy Flags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {displayJob.policy_flags.map((flag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded border border-purple-200"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {displayJob.apply_url && (
              <div className="pt-4 border-t border-gray-200">
                <a
                  href={displayJob.apply_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  Apply Now
                  <svg
                    className="ml-2 w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
