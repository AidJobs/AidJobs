/**
 * Admin delete safety (UX-06). Confirmations compare the typed value exactly, without trimming
 * or case folding, so nothing but the exact text enables a destructive action.
 */
import { MEILI_NOT_CONFIGURED, type SearchStatus } from './status';

export function confirmationMatches(typed: string, required: string): boolean {
  return required.length > 0 && typed === required;
}

/** Hard Delete: the typed value must be exactly the number of selected jobs. */
export function hardDeleteConfirmationMatches(typed: string, count: number): boolean {
  return Number.isInteger(count) && count > 0 && typed === String(count);
}

/** Which danger actions a source offers. The backend allows a permanent delete only after a delete. */
export function sourceDangerActions(status: string | null | undefined): { deleteSource: boolean; permanentDelete: boolean } {
  const deleted = status === 'deleted';
  return { deleteSource: !deleted, permanentDelete: deleted };
}

/**
 * Which row actions the sources list offers. The backend refuses to crawl or edit a deleted
 * source; it is restored by adding it again.
 */
export function sourceRowActions(status: string | null | undefined): { run: boolean; toggle: boolean; edit: boolean } {
  const live = status !== 'deleted';
  return { run: live, toggle: live, edit: live };
}

export type ImpactCount =
  | { state: 'loading' }
  | { state: 'ok'; count: number; atLeast: boolean }
  | { state: 'error'; message: string };

/** Jobs for a source, from `/api/admin/jobs/search` (`data.total`). */
export function jobCountFrom(ok: boolean, body: unknown): ImpactCount {
  const total = (body as { status?: string; data?: { total?: unknown } } | null)?.data?.total;
  if (!ok || (body as { status?: string } | null)?.status !== 'ok' || typeof total !== 'number' || total < 0) {
    return { state: 'error', message: errorText(body, 'The number of jobs could not be loaded.') };
  }
  return { state: 'ok', count: total, atLeast: false };
}

/** Crawl runs for a source, from `/api/admin/crawl/logs`; that endpoint returns at most `limit` rows. */
export function crawlRunCountFrom(ok: boolean, body: unknown, limit: number): ImpactCount {
  const data = (body as { status?: string; data?: unknown } | null)?.data;
  if (!ok || (body as { status?: string } | null)?.status !== 'ok' || !Array.isArray(data)) {
    return { state: 'error', message: errorText(body, 'The number of crawl runs could not be loaded.') };
  }
  return { state: 'ok', count: data.length, atLeast: data.length >= limit };
}

/** A destructive action is enabled only when every impact count loaded and the confirmation matches. */
export function canConfirm(impacts: ImpactCount[], confirmed: boolean): boolean {
  return confirmed && impacts.length > 0 && impacts.every((i) => i.state === 'ok');
}

export function countText(impact: ImpactCount, noun: string): string {
  if (impact.state === 'loading') return `Counting ${noun}s…`;
  if (impact.state === 'error') return impact.message;
  const n = impact.atLeast ? `at least ${impact.count}` : String(impact.count);
  return `${n} ${noun}${impact.count === 1 && !impact.atLeast ? '' : 's'}`;
}

/**
 * Meilisearch buttons (sync, initialise) are hidden only when the backend confirms Meilisearch is
 * not configured. Any other state, including an error, keeps them visible as before.
 */
export function meiliControlsVisible(status: SearchStatus | null, loadError: string | null): boolean {
  return !(!loadError && status && !status.enabled && status.error === MEILI_NOT_CONFIGURED);
}

function errorText(body: unknown, fallback: string): string {
  const b = body as { error?: unknown; detail?: unknown } | null;
  const detail = typeof b?.error === 'string' ? b.error : typeof b?.detail === 'string' ? b.detail : '';
  return detail ? `${fallback} (${detail})` : fallback;
}
