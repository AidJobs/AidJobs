/**
 * `/api/jobs/{id}` answers `{ status, data, source }`. Return the job inside it,
 * or null when the backend reports an error.
 */
export function unwrapJob<T>(body: unknown): T | null {
  if (!body || typeof body !== 'object') return null;
  const envelope = body as { status?: unknown; data?: unknown };
  if (!('status' in envelope)) return body as T;
  if (envelope.status !== 'ok' || !envelope.data || typeof envelope.data !== 'object') return null;
  return envelope.data as T;
}
