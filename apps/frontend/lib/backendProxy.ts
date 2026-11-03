import { NextResponse } from 'next/server';
import { adminBackendFetch, adminBackendOrigin } from './adminBackend';

/**
 * One way for the proxy routes under app/api to call the backend (security plan, stage 4).
 *
 * The backend's JSON answers and status codes pass through, with its X-Request-ID. Nothing else
 * from the backend or from Node reaches the browser: a failure gets fixed text, and the log gets
 * one line with the route, the status or "unreachable", the reference, and the error's code.
 * Request and response bodies, query strings, cookies, and error messages are never logged.
 */

export const MESSAGES = {
  unavailable: 'The service did not answer. Try again shortly.',
  adminUnavailable:
    'The admin service did not answer. It may be starting up; wait a moment and try again.',
  unreadable: 'The service sent an answer that could not be read.',
  invalidRequest: 'The request was not valid.',
  invalidJson: 'The request body is not valid JSON.',
  notSignedIn: 'Authentication required',
  notFound: 'Not found',
  tooMany: 'Too many requests. Wait a moment and try again.',
} as const;

const MAX_MESSAGE_LENGTH = 300;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;
const ERROR_NAME = /^[A-Za-z]{1,40}$/;

export type FailureKind = 'unavailable' | 'unreadable' | 'backend' | 'invalid-request';

/** The body of a failed answer, in the shape the route's callers already read. */
export type ErrorBody = (message: string, kind: FailureKind, requestId: string | null) => object;

/** Public status routes: `{status: 'error', error}`. The reference travels only in the header. */
export const statusErrorBody: ErrorBody = (message) => ({ status: 'error', error: message });

/** Admin routes: the message under both keys the pages read, and the reference when known. */
export const adminErrorBody: ErrorBody = (message, kind, requestId) => ({
  status: 'error',
  error: message,
  detail: message,
  ...(requestId ? { request_id: requestId } : {}),
  ...(kind === 'unavailable' ? { reason: 'unavailable' } : {}),
});

type SessionRequest = Parameters<typeof adminBackendFetch>[0];

export type ProxyCall = {
  /** The proxy's own method and path, for the log line; never a query string. */
  route: string;
  /** The backend path, query string included. */
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON, labelled `application/json`. */
  body?: unknown;
  /** An admin call: the browser's session goes with it (adminBackendFetch). */
  session?: SessionRequest;
  errorBody: ErrorBody;
};

function requestIdOf(response: Response): string | null {
  const value = response.headers.get('x-request-id');
  return value && REQUEST_ID.test(value) ? value : null;
}

function errorCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  if (typeof cause?.code === 'string' && ERROR_CODE.test(cause.code)) return cause.code;
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' && ERROR_NAME.test(name) ? name : 'Error';
}

function logFailure(route: string, outcome: string, requestId: string | null): void {
  console.error(`[proxy] ${route}: ${outcome}${requestId ? ` (ref ${requestId.slice(0, 8)})` : ''}`);
}

/** The message for a failed backend answer: its own text when it gave one, else fixed text. */
function backendMessage(status: number, parsed: unknown): string {
  if (parsed && typeof parsed === 'object') {
    const { detail, error } = parsed as { detail?: unknown; error?: unknown };
    for (const candidate of [detail, error]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().slice(0, MAX_MESSAGE_LENGTH);
      }
    }
    if (Array.isArray(detail)) return MESSAGES.invalidRequest;
  }
  if (status === 401) return MESSAGES.notSignedIn;
  if (status === 404) return MESSAGES.notFound;
  if (status === 422) return MESSAGES.invalidRequest;
  if (status === 429) return MESSAGES.tooMany;
  return `The service failed (HTTP ${status}). Try again.`;
}

function answer(body: object | null, status: number, requestId: string | null, admin: boolean) {
  const response =
    body === null ? new NextResponse(null, { status }) : NextResponse.json(body, { status });
  if (requestId) response.headers.set('X-Request-ID', requestId);
  if (admin) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export async function proxyToBackend(call: ProxyCall): Promise<NextResponse> {
  const admin = call.session !== undefined;
  const init: RequestInit = { method: call.method ?? 'GET' };
  if (call.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(call.body);
  }

  let response: Response;
  try {
    response = call.session
      ? await adminBackendFetch(call.session, call.path, init)
      : await fetch(`${adminBackendOrigin()}${call.path}`, {
          ...init,
          cache: 'no-store',
          redirect: 'manual',
        });
  } catch (error) {
    logFailure(call.route, `backend unreachable, ${errorCode(error)}`, null);
    const message = admin ? MESSAGES.adminUnavailable : MESSAGES.unavailable;
    return answer(call.errorBody(message, 'unavailable', null), 503, null, admin);
  }

  const requestId = requestIdOf(response);
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    logFailure(call.route, `answer unreadable, ${errorCode(error)}`, requestId);
    return answer(call.errorBody(MESSAGES.unreadable, 'unreadable', requestId), 502, requestId, admin);
  }

  if (response.ok) {
    if (response.status === 204 || text === '') return answer(null, response.status, requestId, admin);
    const parsed = parseJson(text);
    if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
      return answer(parsed.value, response.status, requestId, admin);
    }
    logFailure(call.route, `backend ${response.status} answer not JSON`, requestId);
    return answer(call.errorBody(MESSAGES.unreadable, 'unreadable', requestId), 502, requestId, admin);
  }

  const parsed = parseJson(text);
  logFailure(call.route, `backend ${response.status}`, requestId);
  const message = backendMessage(response.status, parsed.ok ? parsed.value : null);
  return answer(call.errorBody(message, 'backend', requestId), response.status, requestId, admin);
}

/** The browser's JSON body, or a 400 with fixed text when it is not JSON. */
export async function readJsonBody(
  request: Request,
  errorBody: ErrorBody,
  admin = false
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: answer(errorBody(MESSAGES.invalidJson, 'invalid-request', null), 400, null, admin),
    };
  }
}
