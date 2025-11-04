'use client';

import { useEffect, useRef } from 'react';

type Job = {
  id: string;
  org_name: string;
  title: string;
  deadline?: string;
};

type SavedJobsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  shortlistedIds: string[];
  allJobs: Job[];
  onOpenJob: (job: Job) => void;
  onRemove: (jobId: string) => void;
};

export default function SavedJobsPanel({
  isOpen,
  onClose,
  shortlistedIds,
  allJobs,
  onOpenJob,
  onRemove,
}: SavedJobsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const savedJobs = shortlistedIds
    .map(id => allJobs.find(job => job.id === id))
    .filter(Boolean) as Job[];

  const missingCount = shortlistedIds.length - savedJobs.length;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50"
      role="dialog"
      aria-label="Saved jobs"
    >
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Saved Jobs</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {savedJobs.length === 0 && missingCount === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No saved jobs yet
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {savedJobs.map(job => (
              <div key={job.id} className="p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => {
                      onOpenJob(job);
                      onClose();
                    }}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">
                      {job.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{job.org_name}</p>
                    {job.deadline && (
                      <p className="text-xs text-gray-500 mt-1">
                        Due: {new Date(job.deadline).toLocaleDateString()}
                      </p>
                    )}
                  </button>
                  <button
                    onClick={() => onRemove(job.id)}
                    className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    aria-label="Remove from saved"
                    title="Remove from saved"
                  >
                    <svg className="w-4 h-4 text-gray-400 hover:text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            {missingCount > 0 && (
              <div className="p-3 bg-gray-50 text-xs text-gray-500 text-center">
                {missingCount} saved {missingCount === 1 ? 'job' : 'jobs'} not in current results
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
