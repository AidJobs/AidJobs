/**
 * Effective crawl schedule helpers mirroring apps/backend/orchestrator.py (W-39 D2).
 *
 * Backend rules:
 * - crawl_frequency_days of null, <= 0, or 3 (legacy column default) means
 *   "use the org-type default": un/ingo = 0.5d (12h), ngo = 1d, private = 5d,
 *   academic = 7d, blank/other = 1d.
 * - Any other positive integer is an explicit custom base in days.
 * - Adaptive rules (health, activity, no-change, failure backoff) and +/-15%
 *   jitter adjust next_run_at around this base.
 */

export const LEGACY_DEFAULT_FREQ_DAYS = 3;
export const MAX_CUSTOM_FREQ_DAYS = 365;

export const DEFAULT_FREQ_DAYS: Readonly<Record<string, number>> = {
  un: 0.5,
  ingo: 0.5,
  ngo: 1,
  private: 5,
  academic: 7,
};

const ORG_TYPE_LABELS: Readonly<Record<string, string>> = {
  un: 'UN',
  ingo: 'INGO',
  ngo: 'NGO',
  private: 'Private',
  academic: 'Academic',
};

export const ADAPTIVE_SCHEDULE_NOTE =
  'Base interval; adaptive rules and ±15% jitter adjust the next run.';

export type ScheduleMode = 'auto' | 'custom';

export type EffectiveSchedule = {
  days: number;
  isDefault: boolean;
  orgTypeKey: string | null;
  intervalLabel: string;
  summaryLabel: string;
};

export function usesOrgTypeDefault(
  crawlFrequencyDays: number | null | undefined
): boolean {
  if (
    crawlFrequencyDays === null ||
    crawlFrequencyDays === undefined ||
    !Number.isFinite(crawlFrequencyDays)
  ) {
    return true;
  }
  return crawlFrequencyDays <= 0 || crawlFrequencyDays === LEGACY_DEFAULT_FREQ_DAYS;
}

function hasOwnDefaultOrgType(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_FREQ_DAYS, key);
}

export function defaultFreqDays(orgType: string | null | undefined): number {
  const key = (orgType ?? '').trim().toLowerCase();
  if (hasOwnDefaultOrgType(key)) {
    return DEFAULT_FREQ_DAYS[key];
  }
  return 1;
}

export function formatInterval(days: number): string {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return hours === 1 ? 'Every 1 hour' : `Every ${hours} hours`;
  }
  if (days === 1) {
    return 'Every 1 day';
  }
  return `Every ${days} days`;
}

export function resolveEffectiveSchedule(
  crawlFrequencyDays: number | null | undefined,
  orgType: string | null | undefined
): EffectiveSchedule {
  const isDefault = usesOrgTypeDefault(crawlFrequencyDays);
  const key = (orgType ?? '').trim().toLowerCase();
  const knownKey = hasOwnDefaultOrgType(key) ? key : null;
  const days = isDefault
    ? defaultFreqDays(orgType)
    : (crawlFrequencyDays as number);
  const intervalLabel = formatInterval(days);
  const qualifier = isDefault
    ? knownKey
      ? `${ORG_TYPE_LABELS[knownKey]} default`
      : 'default'
    : 'custom';

  return {
    days,
    isDefault,
    orgTypeKey: knownKey,
    intervalLabel,
    summaryLabel: `${intervalLabel} (${qualifier})`,
  };
}

export function scheduleModeFromStored(
  crawlFrequencyDays: unknown
): { mode: ScheduleMode; customDays: string } {
  if (typeof crawlFrequencyDays !== 'number' || !Number.isFinite(crawlFrequencyDays)) {
    return { mode: 'auto', customDays: '' };
  }
  const truncated = Math.trunc(crawlFrequencyDays);
  if (usesOrgTypeDefault(truncated)) {
    return { mode: 'auto', customDays: '' };
  }
  return {
    mode: 'custom',
    customDays: String(truncated),
  };
}

export type SchedulePayloadResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Converts form schedule state into the integer sent as `crawl_frequency_days`.
 *
 * Uses `LEGACY_DEFAULT_FREQ_DAYS` (3) for Auto mode because backend PATCH skips
 * `null` (`if update.crawl_frequency_days is not None`), so sending 3 ensures
 * switching a source from a custom override back to Auto persists cleanly.
 */
export function crawlFrequencyPayload(
  mode: ScheduleMode,
  customDays: string
): SchedulePayloadResult {
  if (mode === 'auto') {
    return { ok: true, value: LEGACY_DEFAULT_FREQ_DAYS };
  }
  const trimmed = customDays.trim();
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: `Enter a whole number of days between 1 and ${MAX_CUSTOM_FREQ_DAYS}.`,
    };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CUSTOM_FREQ_DAYS) {
    return {
      ok: false,
      error: `Enter a whole number of days between 1 and ${MAX_CUSTOM_FREQ_DAYS}.`,
    };
  }
  if (parsed === LEGACY_DEFAULT_FREQ_DAYS) {
    return {
      ok: false,
      error:
        '3 days is reserved by the scheduler for the org-type default. Use Auto, or choose another number of days (such as 2 or 4).',
    };
  }
  return { ok: true, value: parsed };
}
