/**
 * Admin session and login outcomes. A backend that does not answer (Render's free plan sleeps,
 * and waking took 34 s on 25 October 2026) is never reported as a rejected session or a wrong
 * password. Session creation and validation are unchanged.
 */

/** The route handlers wait this long for the backend, inside Vercel's 60 s function limit. */
export const BACKEND_WAIT_MS = 55_000;
/** The admin layout keeps checking the session for at most this long before giving up. */
export const SESSION_CHECK_BUDGET_MS = 60_000;
export const SESSION_CHECK_MAX_ATTEMPTS = 3;
export const SESSION_RETRY_DELAY_MS = 3_000;
/** After this long without an answer, the page explains that the service may be starting. */
export const SLOW_AFTER_MS = 3_000;

export const STARTING_UP_MESSAGE = 'The admin service is starting up… This can take up to a minute.';
export const SESSION_TIMEOUT_MESSAGE =
  'The admin service did not answer within a minute. It may still be starting; try again shortly.';

export type SessionOutcome = 'ok' | 'signed-out' | 'rejected' | 'unavailable';

/**
 * Classify an answer from `/api/admin/session`. `status` is null when the request itself failed.
 * The route answers `reason: "missing"` (no cookie), `"invalid"` (401, rejected or expired),
 * or `"unavailable"` (503, the backend did not answer).
 */
export function classifySession(status: number | null, body: unknown): SessionOutcome {
  if (status === null) return 'unavailable';
  const b = (body ?? null) as { authenticated?: unknown; reason?: unknown } | null;
  if (status === 200 && b?.authenticated === true) return 'ok';
  if (b?.reason === 'missing') return 'signed-out';
  if (b?.reason === 'unavailable' || status >= 500 || b === null) return 'unavailable';
  if (status === 401 || b?.reason === 'invalid') return 'rejected';
  return 'signed-out';
}

export type SessionStep =
  | { action: 'done'; outcome: Exclude<SessionOutcome, 'unavailable'> }
  | { action: 'retry'; delayMs: number }
  | { action: 'give-up' };

/** Retry only while the backend is unavailable, within the attempt and time budget. */
export function nextSessionStep(outcome: SessionOutcome, attempt: number, elapsedMs: number): SessionStep {
  if (outcome !== 'unavailable') return { action: 'done', outcome };
  if (attempt >= SESSION_CHECK_MAX_ATTEMPTS || elapsedMs + SESSION_RETRY_DELAY_MS >= SESSION_CHECK_BUDGET_MS) {
    return { action: 'give-up' };
  }
  return { action: 'retry', delayMs: SESSION_RETRY_DELAY_MS };
}

/** Where the admin layout sends a visitor whose session is not usable. */
export function loginPathFor(outcome: 'signed-out' | 'rejected'): string {
  return outcome === 'signed-out' ? '/admin/login?reason=signed-out' : '/admin/login?reason=expired';
}

/** The login page's notice for the reason it was opened with. */
export function loginReasonMessage(reason: string | null): string {
  if (reason === 'signed-out') return 'Sign in to continue.';
  if (reason === 'expired' || reason === 'session') return 'Your session has expired or was not accepted. Sign in again.';
  return '';
}

export type LoginOutcome =
  | { kind: 'ok' }
  | { kind: 'wrong-password' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

const LOGIN_UNAVAILABLE =
  'The admin service did not answer. It may be starting up; wait a moment and try again.';

/**
 * Classify an answer from `/api/admin/login`. Only a 401 means a wrong password. A failed request,
 * a non-JSON server error from the platform (such as Vercel's timeout page), or the route's
 * `reason: "unavailable"` means the service did not answer. Other errors show their own message
 * (for example 429, or "Admin not configured").
 */
export function classifyLogin(status: number | null, body: unknown): LoginOutcome {
  if (status === null) return { kind: 'unavailable', message: LOGIN_UNAVAILABLE };
  const b = (body ?? null) as { authenticated?: unknown; reason?: unknown; detail?: unknown; error?: unknown } | null;
  if (status >= 200 && status < 300 && b?.authenticated === true) return { kind: 'ok' };
  if (status === 401) return { kind: 'wrong-password' };
  if (b?.reason === 'unavailable' || (status >= 500 && b === null)) {
    return { kind: 'unavailable', message: LOGIN_UNAVAILABLE };
  }
  const detail = typeof b?.detail === 'string' ? b.detail : typeof b?.error === 'string' ? b.error : '';
  return { kind: 'error', message: detail || `Login failed (HTTP ${status}). Try again.` };
}

/** True when an error from `fetch` means the backend did not answer in time or at all. */
export function isUnavailableError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError' || error instanceof TypeError;
}
