'use client';

import { ScrollArea, IconButton, Button } from '@aidjobs/ui';
import { X } from 'lucide-react';

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
  const savedJobs = shortlistedIds
    .map(id => allJobs.find(job => job.id === id))
    .filter(Boolean) as Job[];

  const missingCount = shortlistedIds.length - savedJobs.length;

  if (!isOpen) return null;

  return (
    <div
      className="absolute right-0 top-12 w-80 bg-surface border border-border rounded-lg shadow-xl z-50"
      role="dialog"
      aria-label="Saved jobs"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Saved Jobs</h3>
        <IconButton
          onClick={onClose}
          variant="ghost"
          size="sm"
          icon={X}
          aria-label="Close"
        />
      </div>

      <ScrollArea className="max-h-96">
        {savedJobs.length === 0 && missingCount === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No saved jobs yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {savedJobs.map(job => (
              <div key={job.id} className="p-3 hover:bg-muted transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <Button
                    onClick={() => {
                      onOpenJob(job);
                      onClose();
                    }}
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-left h-auto flex-col items-start px-0 py-0"
                  >
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {job.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{job.org_name}</p>
                    {job.deadline && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Due: {new Date(job.deadline).toLocaleDateString()}
                      </p>
                    )}
                  </Button>
                  <IconButton
                    onClick={() => onRemove(job.id)}
                    variant="ghost"
                    size="sm"
                    icon={X}
                    className="hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove from saved"
                    title="Remove from saved"
                  />
                </div>
              </div>
            ))}
            {missingCount > 0 && (
              <div className="p-3 bg-muted text-xs text-muted-foreground text-center">
                {missingCount} saved {missingCount === 1 ? 'job' : 'jobs'} not in current results
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
