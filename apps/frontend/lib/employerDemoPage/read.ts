import { isIP } from 'node:net';

/**
 * Reading one page for the employer demo (employer-side plan, section 19, phase 5, A): an organisation's own page, or a job's project
 * page, given in the website or the project field. The model never browses; this reads one https page, follows no links, and keeps
 * only its visible text, so the model can draft About us or About the project from that page alone.
 *
 * The address is resolved once per hop and refused if any address it resolves to is loopback, private, link-local, unique-local,
 * multicast, unspecified, reserved, mapped from one of those, or a cloud-metadata address. The connection goes only to an address that
 * was checked, with the original name for TLS, so a second lookup cannot send it elsewhere. Redirects are checked the same way, stay on
 * https, and stop at three.
 */
export const MAX_BYTES = 500_000;
export const MAX_TEXT = 8000;
export const MAX_REDIRECTS = 3;
export const UNREADABLE = 'this page could not be read';

export type Address = { address: string; family: 4 | 6 };
export type Lookup = (host: string) => Promise<Address[]>;
export type Fetched = { status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Uint8Array> };
/** Connects to `address` only, asking for `url` with its own host name (for TLS and the Host header). */
export type FetchAt = (url: URL, address: Address) => Promise<Fetched>;

export type PageResult = { ok: true; text: string; social: string[] } | { ok: false; reason: string; why: string };

const refuse = (why: string): PageResult => ({ ok: false, reason: UNREADABLE, why });

function v4Bytes(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const n = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return n.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? n : null;
}

/** IPv4 addresses that must never be reached: this network, private, loopback, link-local (metadata), shared, reserved, multicast. */
export function blockedV4(ip: string): boolean {
  const b = v4Bytes(ip);
  if (!b) return true;
  const [a, c] = b;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && c >= 64 && c <= 127) return true;
  if (a === 169 && c === 254) return true;
  if (a === 172 && c >= 16 && c <= 31) return true;
  if (a === 192 && c === 168) return true;
  if (a === 192 && c === 0 && b[2] === 0) return true;
  if (a === 192 && c === 0 && b[2] === 2) return true;
  if (a === 198 && (c === 18 || c === 19)) return true;
  if (a === 198 && c === 51 && b[2] === 100) return true;
  if (a === 203 && c === 0 && b[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

/** An IPv6 address as eight 16-bit groups, with an embedded IPv4 tail expanded; null when it is not one. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  const tail = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const b = v4Bytes(tail[1]);
    if (!b) return null;
    s = `${s.slice(0, -tail[1].length)}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const all = [...head, ...Array(Math.max(0, fill)).fill('0'), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * IPv6 addresses that must never be reached: unspecified, loopback, IPv4-compatible, link-local, site-local, unique-local (including the
 * cloud metadata address fd00:ec2::254), multicast, documentation; and those that carry an IPv4 address (mapped, NAT64, 6to4) when that
 * address is blocked.
 */
export function blockedV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
  if (g.slice(0, 6).every((x) => x === 0)) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedV4(v4Of(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return blockedV4(v4Of(g[6], g[7]));
  if (g[0] === 0x2002) return blockedV4(v4Of(g[1], g[2]));
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  return false;
}

/** Cloud metadata addresses, refused by name too: some are inside ranges above, and listing them keeps the rule plain. */
const METADATA = new Set(['169.254.169.254', '169.254.170.2', '100.100.100.200', '192.0.0.192', 'fd00:ec2::254']);

export function blockedAddress(a: Address): boolean {
  if (METADATA.has(a.address.toLowerCase())) return true;
  return a.family === 6 ? blockedV6(a.address) : blockedV4(a.address);
}

/** An address the user typed, as a URL the reader may try: https only, no user name or password, the usual port, a real host name. */
export function checkUrl(raw: string, base?: URL): URL | null {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (!isIP(host) && !host.includes('.')) return null;
  url.hash = '';
  return url;
}

/** Resolves the host once and checks every address; the first one checked is the one connected to. */
async function resolveChecked(url: URL, lookup: Lookup): Promise<Address | string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const kind = isIP(host);
  let addresses: Address[];
  try {
    addresses = kind ? [{ address: host, family: kind === 6 ? 6 : 4 }] : await lookup(host);
  } catch {
    return 'the name does not resolve';
  }
  if (!addresses.length) return 'the name does not resolve';
  if (addresses.some(blockedAddress)) return 'it resolves to an address that is not public';
  return addresses[0];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const SOCIAL = /^https:\/\/(?:www\.)?(linkedin\.com\/(?:company|school|in)\/|x\.com\/|twitter\.com\/|facebook\.com\/|instagram\.com\/|youtube\.com\/(?:@|c\/|channel\/|user\/))[^\s"'<>?#]+/i;

/** The organisation's social addresses among the page's links, offered later for Organisation settings, never saved by themselves. */
export function socialLinks(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const hit = decode(m[1]).match(SOCIAL)?.[0];
    if (hit) out.add(hit.replace(/\/+$/, ''));
    if (out.size >= 6) break;
  }
  return Array.from(out);
}

/**
 * The page's visible text: script, style, navigation, and the other parts that are not content dropped; email addresses and phone
 * numbers removed; the first 8,000 characters kept.
 */
export function visibleText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|nav|header|footer|form|iframe|button|select)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br|ul|ol|main|aside|blockquote)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(body)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '')
    .replace(/(?:\+|\b00)\d[\d\s().-]{6,}\d|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{3,4}\b/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((l) => l.length > 1)
    .join('\n')
    .slice(0, MAX_TEXT);
}

/** A login page, or a page with no real text to draft from. */
function noRealText(html: string, text: string): boolean {
  if (/<input[^>]+type\s*=\s*["']?password/i.test(html)) return true;
  return text.replace(/\s+/g, ' ').length < 200;
}

async function readBody(body: AsyncIterable<Uint8Array>): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Reads one page under the rules above. `why` is for the route's own log as a short status, never the address or the text. */
export async function readPage(raw: string, deps: { lookup: Lookup; fetchAt: FetchAt }): Promise<PageResult> {
  const start = checkUrl(raw);
  if (!start) return refuse('not an https address');
  let url: URL = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await resolveChecked(url, deps.lookup);
    if (typeof target === 'string') return refuse(target);
    let res: Fetched;
    try {
      res = await deps.fetchAt(url, target);
    } catch {
      return refuse('the connection failed');
    }
    if (res.status >= 300 && res.status < 400) {
      const next: URL | null = res.headers.location ? checkUrl(res.headers.location, url) : null;
      if (!next) return refuse('a redirect that is not https');
      if (hop === MAX_REDIRECTS) return refuse('too many redirects');
      url = next;
      continue;
    }
    if (res.status !== 200) return refuse(`status ${res.status}`);
    const type = (res.headers['content-type'] ?? '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return refuse('not an html page');
    if (Number(res.headers['content-length'] ?? 0) > MAX_BYTES) return refuse('larger than the limit');
    const bytes = await readBody(res.body);
    if (!bytes) return refuse('larger than the limit');
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const text = visibleText(html);
    if (noRealText(html, text)) return refuse('no real text');
    return { ok: true, text, social: socialLinks(html) };
  }
  return refuse('too many redirects');
}
