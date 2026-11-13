import { lookup as dnsLookup } from 'node:dns/promises';
import { request } from 'node:https';
import type { Address, Fetched, FetchAt, Lookup } from './read';

const TIMEOUT_MS = 10_000;

/** The response body, with the connection closed as soon as the reader stops (at the size limit), so the rest is never downloaded. */
async function* limited(res: AsyncIterable<Uint8Array>, req: { destroy: () => void }): AsyncIterable<Uint8Array> {
  try {
    for await (const chunk of res) yield chunk;
  } finally {
    req.destroy();
  }
}

/** One DNS lookup of the host, every address it gives. */
export const lookup: Lookup = async (host) => {
  const all = await dnsLookup(host, { all: true, verbatim: true });
  return all.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

/**
 * One GET to the address already checked, never another: the socket's own lookup is replaced by that address, and the host name stays
 * the URL's, so TLS checks the certificate for the name the user gave. No redirect is followed here; the reader checks each one.
 */
export const fetchAt: FetchAt = (url: URL, address: Address) =>
  new Promise<Fetched>((resolve, reject) => {
    const req = request(
      {
        protocol: 'https:',
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        servername: url.hostname.replace(/^\[|\]$/g, ''),
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'AidJobs employer demo (one page, on request)' },
        lookup: (_host, options, cb) => {
          const all = typeof options === 'object' && options && 'all' in options && options.all;
          if (all) (cb as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(null, [{ address: address.address, family: address.family }]);
          else (cb as (e: null, a: string, f: number) => void)(null, address.address, address.family);
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
        resolve({ status: res.statusCode ?? 0, headers, body: limited(res, req) });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
