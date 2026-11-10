import { createHash, createHmac } from 'crypto';

/**
 * AWS Signature Version 4 with Node's own crypto, so the employer demo's AI route needs no package (employer-side plan, section 19,
 * "The AI chat in the demo"). Signs the host, the date, and any headers passed in, as botocore's SigV4Auth does for non-S3 services.
 */
export type Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export type SignInput = {
  method: string;
  url: string;
  body: string;
  region: string;
  service: string;
  credentials: Credentials;
  headers?: Record<string, string>;
  now?: Date;
};

const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();

/** RFC 3986 encoding, which encodeURIComponent leaves incomplete for !'()*. */
function encode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(params: URLSearchParams): string {
  return Array.from(params.entries())
    .map(([k, v]) => [encode(k), encode(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/** The headers to send with the request: those passed in, the date, the session token if any, and the authorization. */
export function signRequest({ method, url, body, region, service, credentials, headers = {}, now = new Date() }: SignInput): Record<string, string> {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const out: Record<string, string> = { ...headers, 'x-amz-date': amzDate };
  if (credentials.sessionToken) out['x-amz-security-token'] = credentials.sessionToken;
  const signed: Record<string, string> = { host: u.host };
  for (const [k, v] of Object.entries(out)) signed[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  const names = Object.keys(signed).sort();
  const path = u.pathname.split('/').map((seg) => encode(decodeURIComponent(seg))).join('/') || '/';
  const canonical = [method.toUpperCase(), path, canonicalQuery(u.searchParams), names.map((n) => `${n}:${signed[n]}\n`).join(''), names.join(';'), sha256(body)].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  out.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  return out;
}
