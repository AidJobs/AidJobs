/**
 * Shared types and display helpers for W-40 PR 2 (crawl lifecycle & read-only crawl review).
 */
import type { FillRate, Tone } from '@/lib/admin/status';

export type CrawlLogLifecycle = {
  id: string;
  source_id: string;
  org_name: string | null;
  careers_url: string | null;
  found: number;
  inserted: number;
  updated: number;
  skipped: number;
  duration_ms: number | null;
  status: string;
  message: string | null;
  ran_at: string;
  actual_job_count?: number;
  active_at_start?: number | null;
  listing_complete?: boolean | null;
  listing_expected?: number | null;
  listing_stop?: string | null;
  valid_count?: number | null;
  failed_saves?: number | null;
  unrecorded?: number | null;
  matched_active?: number | null;
  observed?: number | null;
  counted?: boolean | null;
  expired?: number | null;
  returned?: number | null;
};

export type RejectionReason = {
  operation: string;
  reason: string;
  count: number;
};

export type CrawlReviewData = {
  id: string;
  source_id: string;
  org_name: string | null;
  careers_url: string | null;
  source_status: string | null;
  ran_at: string | null;
  duration_ms: number | null;
  status: string;
  message: string | null;
  found: number;
  listing_expected: number | null;
  listing_complete: boolean | null;
  listing_stop: string | null;
  valid_count: number | null;
  inserted: number;
  updated: number;
  skipped: number;
  failed_saves: number | null;
  unrecorded: number | null;
  active_at_start: number | null;
  matched_active: number | null;
  observed: number | null;
  counted: boolean | null;
  expired: number | null;
  returned: number | null;
  rejections: {
    total_in_window: number;
    by_reason: RejectionReason[];
    window_start: string | null;
    window_end: string | null;
    attribution_note: string;
  };
  fill_rates: Record<string, FillRate>;
  fill_rates_total_jobs: number;
  quality_score: number;
  fill_rates_note: string;
};

export function foundVsExpectedLabel(found: number, expected: number | null | undefined): string {
  if (expected === null || expected === undefined) {
    return `${found} found (expected unknown)`;
  }
  return `${found} / ${expected} expected`;
}

export function completenessBadge(
  complete: boolean | null | undefined
): { text: string; tone: Tone } {
  if (complete === true) return { text: 'Complete', tone: 'ok' };
  if (complete === false) return { text: 'Partial', tone: 'warn' };
  return { text: 'Unknown', tone: 'neutral' };
}
